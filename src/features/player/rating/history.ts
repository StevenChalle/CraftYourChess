import type { GameSummary } from '@/features/games/normalize'
import { fromDateInput, toDateInput } from '@/lib/dateInput'
import type { Category } from '../summary'

/** A day's rating: the one after its last rated game (day: local midnight, Unix ms). */
export type RatingPoint = { day: number; rating: number; games: number }

/** The chart's time controls: correspondence ratings move too slowly to be worth a curve. */
export type ChartCategory = Exclude<Category, 'daily'>
export const CHART_CATEGORIES: ChartCategory[] = ['bullet', 'blitz', 'rapid', 'classical']

/**
 * The period shown: the last `days` days, today included (it slides with time), or fixed dates
 * (yyyy-mm-dd, local).
 */
export type RatingPeriod =
  { kind: 'last'; days: number } | { kind: 'dates'; from: string; to: string }

const DAY = 86_400_000

function dayOf(time: number): number {
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** The period's first day, and its end (never after now). */
export function periodBounds(period: RatingPeriod, now: number): { from: number; to: number } {
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

/** Lichess's UltraBullet (under 30 s, as Lichess estimates a game): a rating of its own. */
function isUltraBullet(game: Pick<GameSummary, 'source' | 'timeControl'>): boolean {
  const control = game.timeControl
  return (
    game.source === 'lichess' &&
    control.kind === 'clock' &&
    control.initial + 40 * control.increment < 30
  )
}

/** Each day's rating after its last rated game, with that day's number of games, oldest first. */
export function gamePoints(
  games: Pick<GameSummary, 'source' | 'playedAt' | 'rating' | 'rated' | 'timeControl'>[],
): RatingPoint[] {
  const days = new Map<number, { time: number; rating: number; games: number }>()
  for (const game of games) {
    if (!game.rated || game.rating === undefined || isUltraBullet(game)) continue
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
