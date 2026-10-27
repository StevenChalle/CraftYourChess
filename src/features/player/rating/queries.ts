import { queryOptions } from '@tanstack/react-query'
import { gameStore } from '@/features/games/store'
import { findGames } from '@/features/review/fetch'
import { defaultSelection } from '@/features/review/selection'
import { shouldRetry, type ApiSource } from '@/lib/http'
import { fetchRatingHistory } from '@/lib/lichess/client'
import type { Category } from '../summary'
import { gamePoints, lichessHistoryPoints, rangeStart, type RatingRange } from './history'

/**
 * A player's rating in a time control over the range, day by day. Lichess publishes the history;
 * Chess.com does not, so it comes from the rated games of the range, kept in the game store
 * (docs/game-store.md) like the analysis's. Lichess too when its history comes back empty.
 * `onGames`: the number of games found so far, while they download.
 */
export function ratingHistoryQueryOptions(
  source: ApiSource,
  username: string,
  category: Category,
  range: RatingRange,
  onGames?: (count: number) => void,
) {
  return queryOptions({
    queryKey: ['rating-history', source, username.toLowerCase(), category, range] as const,
    queryFn: async ({ signal }) => {
      const now = Date.now()
      const from = rangeStart(range, now)
      if (source === 'lichess') {
        const history = await fetchRatingHistory(username, signal)
        if (history.length > 0) return lichessHistoryPoints(history, category, from)
      }
      const found = await findGames(
        [{ source, username }],
        {
          ...defaultSelection([source]),
          ratings: ['rated'],
          categories: [category],
          scope: { kind: 'range', from, to: now },
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
