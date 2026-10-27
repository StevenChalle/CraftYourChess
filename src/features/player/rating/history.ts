import type { GameSummary } from '@/features/games/normalize'
import type { LichessRatingHistory } from '@/lib/lichess/types'
import type { Category } from '../summary'

/** A day's rating: the last one of that day (local midnight, Unix ms). */
export type RatingPoint = { day: number; rating: number }

export type RatingRange = '7d' | '30d' | '90d' | '365d'
export const RATING_RANGES: RatingRange[] = ['7d', '30d', '90d', '365d']

const DAY = 86_400_000
const RANGE_DAYS: Record<RatingRange, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }

/** First day of the range (local midnight): today and the days before it. */
export function rangeStart(range: RatingRange, now: number): number {
  const start = new Date(now - (RANGE_DAYS[range] - 1) * DAY)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}

function dayOf(time: number): number {
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Lichess perf names in its rating history: no UltraBullet in the bullet curve. */
const LICHESS_PERF: Record<Category, string> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  daily: 'correspondence',
}

/**
 * The category's points from `from` on, from Lichess's history. The rating the player had when
 * the range began starts the curve, so it spans the whole range even after days without games.
 */
export function lichessHistoryPoints(
  history: LichessRatingHistory,
  category: Category,
  from: number,
): RatingPoint[] {
  const perf = history.find((item) => item.name.toLowerCase() === LICHESS_PERF[category])
  const all = (perf?.points ?? [])
    .map(([year, month, day, rating]) => ({ day: new Date(year, month, day).getTime(), rating }))
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

/** The rating after the last rated game of each day, oldest first. */
export function gamePoints(
  games: Pick<GameSummary, 'source' | 'playedAt' | 'rating' | 'rated' | 'timeControl'>[],
): RatingPoint[] {
  const days = new Map<number, { time: number; rating: number }>()
  for (const game of games) {
    if (!game.rated || game.rating === undefined || isUltraBullet(game)) continue
    const time = game.playedAt.getTime()
    const day = dayOf(time)
    const kept = days.get(day)
    if (!kept || kept.time < time) days.set(day, { time, rating: game.rating })
  }
  return [...days.entries()]
    .map(([day, { rating }]) => ({ day, rating }))
    .sort((a, b) => a.day - b.day)
}
