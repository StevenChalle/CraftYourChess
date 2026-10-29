import { queryOptions } from '@tanstack/react-query'
import { gameStore } from '@/features/games/store'
import { findGames } from '@/features/review/fetch'
import { defaultSelection } from '@/features/review/selection'
import { shouldRetry, type ApiSource } from '@/lib/http'
import { toDateInput } from '@/lib/dateInput'
import { fetchRatingHistory } from '@/lib/lichess/client'
import {
  gamePoints,
  lichessHistoryPoints,
  periodBounds,
  periodSummary,
  type PeriodSummary,
  type RatingPoint,
  type ChartCategory,
  type RatingPeriod,
} from './history'

/**
 * A player's rating in a time control over the period, day by day, with each day's number of
 * games, and the period's summary (its results, the opponents, the performance): from the rated games of the period, kept in the game store (docs/game-store.md) like the
 * analysis's, so a period read once is not downloaded again. On Lichess, a lifetime comes from its
 * rating history instead, in one request (a career can be a hundred thousand games), without the
 * games count nor the summary; from the games when that history comes back empty. `joinedAt`: the account's
 * creation (Unix ms), where a lifetime starts. `onGames`: the number of games found so far, while
 * they download.
 */
export function ratingHistoryQueryOptions(
  source: ApiSource,
  username: string,
  category: ChartCategory,
  period: RatingPeriod,
  joinedAt: number | undefined,
  onGames?: (count: number) => void,
) {
  return queryOptions<{ points: RatingPoint[]; summary?: PeriodSummary }>({
    // Today too: a sliding period moves on the next day.
    queryKey: [
      'rating-history',
      source,
      username.toLowerCase(),
      category,
      period,
      toDateInput(Date.now()),
    ] as const,
    queryFn: async ({ signal }) => {
      const { from, to } = periodBounds(period, Date.now(), joinedAt)
      if (source === 'lichess' && period.kind === 'lifetime') {
        const history = await fetchRatingHistory(username, signal)
        if (history.length > 0) {
          return { points: lichessHistoryPoints(history, category, from, to) }
        }
      }
      const found = await findGames(
        [{ source, username }],
        {
          ...defaultSelection([source]),
          ratings: ['rated'],
          categories: [category],
          scope: { kind: 'range', from, to },
        },
        {
          signal,
          store: gameStore,
          onProgress: (progress) => onGames?.(progress[source]?.games ?? 0),
        },
      )
      const failure = found.failures[0]
      if (failure) throw failure.error
      return { points: gamePoints(found.games), summary: periodSummary(found.games) }
    },
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  })
}
