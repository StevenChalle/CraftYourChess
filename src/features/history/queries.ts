import { infiniteQueryOptions } from '@tanstack/react-query'
import { fetchArchiveGames, fetchArchives } from '@/lib/chesscom/client'
import { shouldRetry } from '@/lib/http'
import { fetchGamesPage } from '@/lib/lichess/client'
import {
  ALL_GAMES,
  nextPage,
  startFeed,
  type FeedFetchers,
  type HistoryAccount,
  type HistoryFilter,
} from './feed'

const FETCHERS: FeedFetchers = {
  lichessPage: fetchGamesPage,
  chessComArchives: fetchArchives,
  chessComMonth: fetchArchiveGames,
}

export const historyKeys = {
  /** Every filter of these accounts: the key's prefix */
  accounts: (accounts: HistoryAccount[]) =>
    [
      'history',
      ...accounts.map(({ source, username }) => `${source}:${username.toLowerCase()}`),
    ] as const,
  games: (accounts: HistoryAccount[], filter: HistoryFilter) =>
    [...historyKeys.accounts(accounts), filter] as const,
}

/** Pages of 30 games, newest first; the next page is fetched only when asked for. */
export function historyQueryOptions(accounts: HistoryAccount[], filter: HistoryFilter = ALL_GAMES) {
  return infiniteQueryOptions({
    queryKey: historyKeys.games(accounts, filter),
    queryFn: ({ pageParam, signal }) => nextPage(pageParam, FETCHERS, signal),
    initialPageParam: startFeed(accounts, filter),
    getNextPageParam: (last) => (last.hasMore ? last.state : undefined),
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  })
}
