import {
  byNewest,
  isStandardGame,
  summarizeChessComGame,
  summarizeLichessGame,
  type GameSummary,
} from '@/features/games/normalize'
import type { ChessComGame } from '@/lib/chesscom/types'
import type { ApiSource } from '@/lib/http'
import type { LichessGame } from '@/lib/lichess/types'

/**
 * The game history of linked accounts, all platforms together, newest first, one page at a
 * time. Same games as the review: standard chess, rated or casual (isStandardGame). Nothing is stored: each platform keeps a cursor (Lichess: a date; Chess.com: the monthly
 * archives left) and a buffer of games fetched but not shown yet, and pages are merged by date.
 */

export const HISTORY_PAGE_SIZE = 30

export type HistoryAccount = { source: ApiSource; username: string }

type SourceFeed = {
  source: ApiSource
  username: string
  /** Fetched, not shown yet, newest first */
  buffer: GameSummary[]
  exhausted: boolean
  /** Lichess: next page ends before this start date (Unix ms) */
  until?: number
  /** Chess.com: monthly archives not fetched yet, oldest first (undefined until listed) */
  archives?: string[]
}

export type FeedState = {
  sources: SourceFeed[]
  /** Platforms that failed: left out of the following pages */
  failures: { source: ApiSource; error: Error }[]
}

export type FeedPage = { games: GameSummary[]; state: FeedState; hasMore: boolean }

export type FeedFetchers = {
  lichessPage: (
    username: string,
    max: number,
    until: number | undefined,
    signal?: AbortSignal,
  ) => Promise<LichessGame[]>
  chessComArchives: (username: string, signal?: AbortSignal) => Promise<string[]>
  /** null: a month Chess.com fails to serve (see fetchArchiveGames), skipped */
  chessComMonth: (archiveUrl: string, signal?: AbortSignal) => Promise<ChessComGame[] | null>
}

export function startFeed(accounts: HistoryAccount[]): FeedState {
  return {
    sources: accounts.map(({ source, username }) => ({
      source,
      username,
      buffer: [],
      exhausted: false,
    })),
    failures: [],
  }
}

const keep = (game: GameSummary | undefined): GameSummary[] =>
  game && isStandardGame(game) ? [game] : []

/** Fills an empty buffer, fetching until some game shows up or the platform has no more. */
async function refill(feed: SourceFeed, fetchers: FeedFetchers, signal?: AbortSignal) {
  while (feed.buffer.length === 0 && !feed.exhausted) {
    if (feed.source === 'lichess') {
      const raw = await fetchers.lichessPage(feed.username, HISTORY_PAGE_SIZE, feed.until, signal)
      feed.buffer = raw.flatMap((game) => keep(summarizeLichessGame(game, feed.username)))
      feed.buffer.sort(byNewest)
      if (raw.length > 0) feed.until = Math.min(...raw.map((game) => game.createdAt)) - 1
      feed.exhausted = raw.length < HISTORY_PAGE_SIZE
    } else {
      feed.archives ??= await fetchers.chessComArchives(feed.username, signal)
      const archive = feed.archives.pop()
      if (archive) {
        const month = (await fetchers.chessComMonth(archive, signal)) ?? []
        feed.buffer = month.flatMap((game) => keep(summarizeChessComGame(game, feed.username)))
        feed.buffer.sort(byNewest)
      }
      feed.exhausted = feed.archives.length === 0
    }
  }
}

/** The next `size` games, all platforms together, newest first. */
export async function nextPage(
  state: FeedState,
  fetchers: FeedFetchers,
  signal?: AbortSignal,
  size = HISTORY_PAGE_SIZE,
): Promise<FeedPage> {
  // Pages are kept by the caller: work on a copy.
  const next: FeedState = {
    sources: state.sources.map((feed) => ({
      ...feed,
      buffer: [...feed.buffer],
      archives: feed.archives && [...feed.archives],
    })),
    failures: [...state.failures],
  }
  const games: GameSummary[] = []

  while (games.length < size) {
    // Platforms are fetched in parallel, each one sequentially (their rate limits are per API).
    await Promise.all(
      next.sources.map(async (feed) => {
        try {
          await refill(feed, fetchers, signal)
        } catch (error) {
          signal?.throwIfAborted()
          next.failures.push({ source: feed.source, error: error as Error })
          feed.buffer = []
          feed.exhausted = true
        }
      }),
    )
    const ready = next.sources.filter((feed) => feed.buffer.length > 0)
    if (ready.length === 0) break
    const newest = ready.reduce((a, b) => (byNewest(a.buffer[0]!, b.buffer[0]!) <= 0 ? a : b))
    games.push(newest.buffer.shift()!)
  }

  const hasMore = next.sources.some((feed) => feed.buffer.length > 0 || !feed.exhausted)
  return { games, state: next, hasMore }
}
