import type { GameSummary } from '@/features/games/normalize'
import { fromDateInput, toDateInput } from '@/lib/dateInput'
import type { LichessRatingHistory } from '@/lib/lichess/types'
import type { Category, GameRecord } from '../summary'

/**
 * A day's rating: the one after its last rated game (day: local midnight, Unix ms), with that day's
 * number of games when known (not from Lichess's rating history).
 */
export type RatingPoint = { day: number; rating: number; games?: number }

/** The chart's time controls: correspondence ratings move too slowly to be worth a curve. */
export type ChartCategory = Exclude<Category, 'daily'>
export const CHART_CATEGORIES: ChartCategory[] = ['bullet', 'blitz', 'rapid', 'classical']

/**
 * The period shown: the last `days` days, today included (it slides with time), fixed dates
 * (yyyy-mm-dd, local), or the account's whole life.
 */
export type RatingPeriod =
  | { kind: 'last'; days: number }
  | { kind: 'dates'; from: string; to: string }
  | { kind: 'lifetime' }

/** The periods offered in one click: a number of days back, today included, or the lifetime. */
export type PeriodPreset = 'today' | 'week' | 'month' | 'semester' | 'year' | 'lifetime'
export const PERIOD_PRESETS: PeriodPreset[] = [
  'today',
  'week',
  'month',
  'semester',
  'year',
  'lifetime',
]
const PRESET_DAYS: Record<Exclude<PeriodPreset, 'lifetime'>, number> = {
  today: 1,
  week: 7,
  month: 30,
  semester: 182,
  year: 365,
}

export function presetPeriod(preset: PeriodPreset): RatingPeriod {
  return preset === 'lifetime' ? { kind: 'lifetime' } : { kind: 'last', days: PRESET_DAYS[preset] }
}

/** The preset a period is, if any (dates typed may land on one). */
export function periodPreset(period: RatingPeriod): PeriodPreset | undefined {
  if (period.kind === 'lifetime') return 'lifetime'
  if (period.kind === 'dates') return undefined
  return (Object.keys(PRESET_DAYS) as Exclude<PeriodPreset, 'lifetime'>[]).find(
    (preset) => PRESET_DAYS[preset] === period.days,
  )
}

const DAY = 86_400_000

function dayOf(time: number): number {
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/**
 * The period's first day, and its end (never after now). The lifetime starts when the account was
 * created (`joinedAt`, Unix ms), a year back when unknown.
 */
export function periodBounds(
  period: RatingPeriod,
  now: number,
  joinedAt?: number,
): { from: number; to: number } {
  if (period.kind === 'lifetime') {
    return { from: dayOf(Math.min(joinedAt ?? now - 364 * DAY, now)), to: now }
  }
  if (period.kind === 'last') {
    // Days, not 24 h: a day can last 23 or 25 hours.
    const from = new Date(dayOf(now))
    from.setDate(from.getDate() - (period.days - 1))
    return { from: from.getTime(), to: now }
  }
  const from = fromDateInput(period.from, false) ?? dayOf(now)
  const to = Math.min(fromDateInput(period.to, true) ?? now, now)
  return { from: Math.min(from, dayOf(to)), to }
}

/** The period of the date inputs: up to today, it slides from then on. */
export function periodFromDates(from: string, to: string, now: number): RatingPeriod {
  const today = toDateInput(now)
  if (to < today) return { kind: 'dates', from, to }
  const start = fromDateInput(from, false) ?? dayOf(now)
  return { kind: 'last', days: Math.max(1, Math.round((dayOf(now) - start) / DAY) + 1) }
}

/** Lichess perf names in its rating history: no UltraBullet in the bullet curve. */
const LICHESS_PERF: Record<ChartCategory, string> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
}

/**
 * The time control's points over [from, to], from Lichess's rating history (no games count). The
 * rating the player had when the period began starts the curve.
 */
export function lichessHistoryPoints(
  history: LichessRatingHistory,
  category: ChartCategory,
  from: number,
  to: number,
): RatingPoint[] {
  const perf = history.find((item) => item.name.toLowerCase() === LICHESS_PERF[category])
  const all = (perf?.points ?? [])
    .map(([year, month, day, rating]) => ({ day: new Date(year, month, day).getTime(), rating }))
    .filter((point) => point.day <= to)
    .sort((a, b) => a.day - b.day)
  const before = all.filter((point) => point.day < from).at(-1)
  const inside = all.filter((point) => point.day >= from)
  return before && inside[0]?.day !== from
    ? [{ day: from, rating: before.rating }, ...inside]
    : inside
}

/** Lichess's UltraBullet (under 30 s, as Lichess estimates a game): a rating of its own. */
function isUltraBullet(game: Pick<GameSummary, 'source' | 'timeControl'>): boolean {
  const control = game.timeControl
  return (
    game.source === 'lichess' &&
    control.kind === 'clock' &&
    control.initial + 40 * control.increment < 30
  )
}

type RatedGame = Pick<
  GameSummary,
  'source' | 'playedAt' | 'rating' | 'rated' | 'timeControl' | 'result' | 'opponent'
>

/** The games of the curve: rated, with the player's rating, in the time control's own pool. */
function counts(
  game: Omit<RatedGame, 'result' | 'opponent'>,
): game is typeof game & { rating: number } {
  return game.rated && game.rating !== undefined && !isUltraBullet(game)
}

/** Each day's rating after its last rated game, with that day's number of games, oldest first. */
export function gamePoints(
  games: Pick<GameSummary, 'source' | 'playedAt' | 'rating' | 'rated' | 'timeControl'>[],
): RatingPoint[] {
  const days = new Map<number, { time: number; rating: number; games: number }>()
  for (const game of games) {
    if (!counts(game)) continue
    const time = game.playedAt.getTime()
    const day = dayOf(time)
    const kept = days.get(day)
    if (!kept) days.set(day, { time, rating: game.rating, games: 1 })
    else {
      kept.games++
      if (kept.time < time) Object.assign(kept, { time, rating: game.rating })
    }
  }
  return [...days.entries()]
    .map(([day, { rating, games }]) => ({ day, rating, games }))
    .sort((a, b) => a.day - b.day)
}

/** The highest rating of the points, its first day when reached several times. */
export function peakPoint(points: RatingPoint[]): RatingPoint | undefined {
  return points.reduce<RatingPoint | undefined>(
    (best, point) => (!best || point.rating > best.rating ? point : best),
    undefined,
  )
}

/**
 * The period at a glance: its games, their results, the opponents' average rating, and the
 * performance, the rating these results are worth against them (average opponent + 400 × (wins −
 * losses) / games, the usual linear estimate).
 */
export type PeriodSummary = {
  games: number
  record: GameRecord
  opponentAverage?: number
  performance?: number
}

export function periodSummary(games: RatedGame[]): PeriodSummary {
  const record: GameRecord = { win: 0, draw: 0, loss: 0 }
  let opponents = 0
  let opponentTotal = 0
  for (const game of games) {
    if (!counts(game)) continue
    record[game.result]++
    if (game.opponent.rating !== undefined) {
      opponents++
      opponentTotal += game.opponent.rating
    }
  }
  const total = record.win + record.draw + record.loss
  if (opponents === 0) return { games: total, record }
  const opponentAverage = Math.round(opponentTotal / opponents)
  return {
    games: total,
    record,
    opponentAverage,
    performance: Math.round(opponentAverage + (400 * (record.win - record.loss)) / total),
  }
}
