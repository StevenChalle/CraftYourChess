import { queryOptions } from '@tanstack/react-query'
import { gameStore } from '@/features/games/store'
import { findGames } from '@/features/review/fetch'
import { defaultSelection } from '@/features/review/selection'
import { shouldRetry, type ApiSource } from '@/lib/http'
import { toDateInput } from '@/lib/dateInput'
import { gamePoints, periodBounds, type ChartCategory, type RatingPeriod } from './history'

/**
 * A player's rating in a time control over the period, day by day, with each day's number of
 * games: from the rated games of the period, kept in the game store (docs/game-store.md) like the
 * analysis's, so a period read once is not downloaded again. `onGames`: the number of games found
 * so far, while they download.
 */
export function ratingHistoryQueryOptions(
  source: ApiSource,
  username: string,
  category: ChartCategory,
  period: RatingPeriod,
  onGames?: (count: number) => void,
) {
  return queryOptions({
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
      const { from, to } = periodBounds(period, Date.now())
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
      return gamePoints(found.games)
    },
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  })
}
