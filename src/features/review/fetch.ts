import type { GameCategory } from '@/features/games/normalize'
import { missingPeriods, type Period } from '@/features/games/periods'
import {
  accountKey,
  GameStoreError,
  storedSummary,
  toStoredGame,
  type GameStore,
} from '@/features/games/store'
import { archiveUrl, fetchArchiveGames, fetchArchives } from '@/lib/chesscom/client'
import type { ChessComGame } from '@/lib/chesscom/types'
import type { ApiSource } from '@/lib/http'
import { exportGame, exportStandardGames, type GameExportOptions } from '@/lib/lichess/client'
import type { StoredGame } from '@/lib/db'
import type { LichessGame } from '@/lib/lichess/types'
import type { GameRef } from './gameRef'
import { fromChessComGame, fromLichessGame, latestGames, type ReviewGame } from './games'
import {
  activeRatingFilter,
  ALL_COLORS,
  ALL_RATINGS,
  ALL_RESULTS,
  matchesSelection,
  type GameSelection,
} from './selection'

/**
 * Finds the games of the advanced review: the APIs filter what they can (Lichess: time controls,
 * rated or casual, color, start dates; Chess.com: months), matchesSelection checks everything else.
 */

export type ReviewAccount = { source: ApiSource; username: string }

export type FoundGames = {
  /** Newest first */
  games: ReviewGame[]
  /** Platforms whose games could not be fetched: the others are still reviewed. */
  failures: { source: ApiSource; error: Error }[]
}

/**
 * How far the search of each platform is: games found so far (matching the filters) and the share
 * of the work done (0 to 1), from the games wanted, the period covered or the months read.
 */
export type FetchProgress = Partial<Record<ApiSource, { games: number; ratio: number }>>

type Report = (games: number, ratio: number) => void

export type GameFetchers = {
  lichessExport: (
    username: string,
    options: GameExportOptions,
    signal?: AbortSignal,
    onGame?: (game: LichessGame) => void,
  ) => Promise<LichessGame[]>
  chessComArchives: (username: string, signal?: AbortSignal) => Promise<string[]>
  /** null: a month Chess.com fails to serve (see fetchArchiveGames), skipped */
  chessComMonth: (archiveUrl: string, signal?: AbortSignal) => Promise<ChessComGame[] | null>
}

const API_FETCHERS: GameFetchers = {
  lichessExport: exportStandardGames,
  chessComArchives: fetchArchives,
  chessComMonth: fetchArchiveGames,
}

/** The background analysis's downloads: not the player's, so they never pause it (lib/activity.ts). */
export const BACKGROUND_FETCHERS: GameFetchers = {
  lichessExport: (username, options, signal, onGame) =>
    exportStandardGames(username, options, signal, onGame, true),
  chessComArchives: (username, signal) => fetchArchives(username, signal, true),
  chessComMonth: (url, signal) => fetchArchiveGames(url, signal, true),
}

const LICHESS_PERFS: Record<GameCategory, string[]> = {
  bullet: ['ultraBullet', 'bullet'],
  blitz: ['blitz'],
  rapid: ['rapid'],
  classical: ['classical'],
  daily: ['correspondence'],
  // Only imported games have no time control
  unknown: [],
}

const DAY = 86_400_000
/** Lichess filters dates on the start of a game: correspondence games can last weeks. */
const CORRESPONDENCE_MARGIN = 60 * DAY
/** Pages of the "latest games" search on Lichess, fetched one after the other. */
const LICHESS_PAGE = 100
/**
 * Lichess only exports finished games, and filters on their start: a game started before a search
 * but finished after it would be missed. The store's periods end this long before their search.
 */
const LIVE_OVERLAP = 3 * 60 * 60 * 1000
const overlap = (perf: string) => (perf === 'correspondence' ? CORRESPONDENCE_MARGIN : LIVE_OVERLAP)

const share = (done: number, total: number) =>
  total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0

async function findLichessGames(
  username: string,
  selection: GameSelection,
  fetchers: GameFetchers,
  report: Report,
  signal?: AbortSignal,
): Promise<ReviewGame[]> {
  const base: GameExportOptions = {
    perfTypes: selection.categories.flatMap((category) => LICHESS_PERFS[category]),
    color: selection.colors.length === 1 ? selection.colors[0] : undefined,
    rated: selection.ratings.length === 1 ? selection.ratings[0] === 'rated' : undefined,
  }
  const keep = (games: LichessGame[]) =>
    games.flatMap((game) => {
      const review = fromLichessGame(game, username)
      return review && matchesSelection(review, selection) ? [review] : []
    })

  const { scope } = selection
  const limit = scope.kind === 'latest' ? scope.count : scope.max
  let since: number | undefined
  let until: number | undefined
  if (scope.kind === 'range') {
    const margin = selection.categories.includes('daily') ? CORRESPONDENCE_MARGIN : DAY
    since = scope.from - margin
    until = scope.to
  }
  // Games stream in newest first: the share of the period covered, or of the games wanted.
  const end = until
  const progress = (found: number, game: LichessGame) =>
    Math.max(
      limit === undefined ? 0 : share(found, limit),
      since === undefined || end === undefined ? 0 : share(end - game.createdAt, end - since),
    )
  let streamed = 0
  const onGame = (base: number) => (game: LichessGame) => {
    streamed += keep([game]).length
    report(base + streamed, progress(base + streamed, game))
  }

  // A whole date range, in one request.
  if (limit === undefined) {
    const games = keep(
      await fetchers.lichessExport(username, { ...base, since, until }, signal, onGame(0)),
    )
    report(games.length, 1)
    return games
  }

  // Results, opponent ratings and end dates are only checked here: then page backwards until enough games
  // match. Without them, Lichess returns exactly the right games (the quick review asks for 1).
  const filteredHere =
    scope.kind === 'range' ||
    selection.results.length < ALL_RESULTS.length ||
    activeRatingFilter(selection) !== undefined
  const pageSize = filteredHere ? Math.max(LICHESS_PAGE, limit) : limit
  const found: ReviewGame[] = []
  while (found.length < limit) {
    streamed = 0
    const page = await fetchers.lichessExport(
      username,
      { ...base, max: pageSize, since, until },
      signal,
      onGame(found.length),
    )
    found.push(...keep(page))
    if (page.length < pageSize) break
    until = Math.min(...page.map((game) => game.createdAt)) - 1
  }
  report(found.length, 1)
  return found
}

/** Year and month of a Chess.com archive URL (…/games/2026/10), as the month's first day. */
function archiveMonth(url: string): { start: number; end: number } | undefined {
  const match = /\/(\d{4})\/(\d{2})$/.exec(url)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  return { start: Date.UTC(year, month, 1), end: Date.UTC(year, month + 1, 1) }
}

/** The archives to read, newest first: those of the period, if one is chosen. */
function monthsToRead(archives: string[], { scope }: GameSelection): string[] {
  const newest = archives.toReversed()
  if (scope.kind !== 'range') return newest
  return newest.filter((url) => {
    const month = archiveMonth(url)
    // A day of margin for time zones: games are checked on their exact end date anyway.
    return !month || (month.end + DAY > scope.from && month.start - DAY <= scope.to)
  })
}

async function findChessComGames(
  username: string,
  selection: GameSelection,
  fetchers: GameFetchers,
  report: Report,
  signal?: AbortSignal,
): Promise<ReviewGame[]> {
  const { scope } = selection
  const archives = monthsToRead(await fetchers.chessComArchives(username, signal), selection)
  const found: ReviewGame[] = []
  const limit = scope.kind === 'latest' ? scope.count : scope.max
  report(0, 0)
  // Newest month first, one request at a time (Chess.com limits parallel requests).
  for (const [index, archive] of archives.entries()) {
    const month = (await fetchers.chessComMonth(archive, signal)) ?? []
    for (const game of month) {
      const review = fromChessComGame(game, username)
      if (review && matchesSelection(review, selection)) found.push(review)
    }
    if (limit !== undefined && found.length >= limit) break
    report(
      found.length,
      Math.max(
        limit === undefined ? 0 : share(found.length, limit),
        share(index + 1, archives.length),
      ),
    )
  }
  report(found.length, 1)
  return found
}

/** Whether the Lichess games must be filtered here, so that pages bigger than asked are worth it. */
function filteredHere(selection: GameSelection): boolean {
  return (
    selection.scope.kind === 'range' ||
    selection.results.length < ALL_RESULTS.length ||
    selection.colors.length < ALL_COLORS.length ||
    selection.ratings.length < ALL_RATINGS.length ||
    activeRatingFilter(selection) !== undefined
  )
}

/**
 * The Lichess games of the selection, through the store: only what it lacks is asked for, the
 * newest gap first, perf by perf (docs/game-store.md). Color and rated or casual are filtered here,
 * so that the periods only depend on the perfs. Every game received is stored at once, and the
 * period it proves complete with it: stopping loses nothing.
 */
async function findLichessGamesStored(
  username: string,
  selection: GameSelection,
  fetchers: GameFetchers,
  store: GameStore,
  report: Report,
  now: () => number,
  signal?: AbortSignal,
): Promise<ReviewGame[]> {
  const account = accountKey('lichess', username)
  const perfs = [...new Set(selection.categories.flatMap((category) => LICHESS_PERFS[category]))]
  const { scope } = selection
  const limit = scope.kind === 'latest' ? scope.count : scope.max
  const start = now()
  let bottom = 0
  let top = start
  if (scope.kind === 'range') {
    bottom = scope.from - (selection.categories.includes('daily') ? CORRESPONDENCE_MARGIN : DAY)
    top = Math.min(scope.to, start)
  }
  const sync = await store.loadSync(account)
  /** What this search fetched: complete for its duration, even the hours a period leaves out */
  const fetched: Record<string, Period[]> = {}
  const newestGap = (perf: string) =>
    missingPeriods([...(sync.lichess?.[perf] ?? []), ...(fetched[perf] ?? [])], {
      from: bottom,
      to: top,
    }).at(-1)
  const matches = (game: StoredGame) => {
    const summary = storedSummary(game, username)
    return summary !== undefined && matchesSelection(summary, selection)
  }
  const started = (game: StoredGame) => game.createdAt ?? game.playedAt
  const progress = (found: number, createdAt: number) =>
    Math.max(limit === undefined ? 0 : share(found, limit), share(top - createdAt, top - bottom))

  while (perfs.length > 0) {
    // Games started from `floor` on are all stored, for every perf asked.
    const gaps = perfs.flatMap((perf) => {
      const gap = newestGap(perf)
      return gap ? [{ perf, gap }] : []
    })
    const floor = Math.max(bottom, ...gaps.map(({ gap }) => gap.to + 1))
    const found = await store.query(
      account,
      bottom,
      Infinity,
      (game) => started(game) >= floor && started(game) <= top && matches(game),
      limit,
    )
    if (gaps.length === 0 || (limit !== undefined && found.length >= limit)) {
      report(found.length, 1)
      return found.flatMap((game) => fromLichessGame(game.raw as LichessGame, username) ?? [])
    }
    report(found.length, progress(found.length, floor))

    // The newest gap (the shortest one if several end together), for every perf that has the same:
    // correspondence keeps 60 days open, the others 3 hours, so they are not asked together.
    const { from, to } = gaps
      .map(({ gap }) => gap)
      .reduce((best, gap) =>
        gap.to > best.to || (gap.to === best.to && gap.from > best.from) ? gap : best,
      )
    const group = gaps.filter(({ gap }) => gap.from === from && gap.to === to)
    const groupPerfs = group.map(({ perf }) => perf)
    const wanted = limit === undefined ? undefined : limit - found.length
    const max =
      wanted === undefined
        ? undefined
        : filteredHere(selection)
          ? Math.max(LICHESS_PAGE, wanted)
          : wanted

    const requestedAt = now()
    let received = 0
    let oldest = to + 1
    let streamed = 0
    let batch: StoredGame[] = []
    let writing = Promise.resolve()
    const flush = () => {
      if (batch.length > 0) {
        const games = batch
        batch = []
        writing = writing.then(() => store.put(games))
      }
      return writing
    }
    const receive = (game: LichessGame) => {
      received++
      oldest = Math.min(oldest, game.createdAt)
      const stored = toStoredGame('lichess', username, game)
      if (stored) {
        batch.push(stored)
        if (matches(stored)) streamed++
      }
      if (batch.length >= 100) flush().catch(() => {})
      report(found.length + streamed, progress(found.length + streamed, game.createdAt))
    }
    /** Stores what arrived, then the period it covers: all of it, or down to the oldest game. */
    const record = async (complete: boolean) => {
      await flush()
      const low = complete ? from : oldest
      if (low > to) return
      const periods: Record<string, Period> = {}
      for (const perf of groupPerfs) {
        fetched[perf] = [...(fetched[perf] ?? []), { from: low, to }]
        const end = Math.min(to, requestedAt - overlap(perf))
        if (end >= low) periods[perf] = { from: low, to: end }
      }
      if (Object.keys(periods).length > 0) await store.addLichessPeriods(account, periods)
    }

    try {
      const page = await fetchers.lichessExport(
        username,
        { perfTypes: groupPerfs, max, since: from, until: to },
        signal,
        receive,
      )
      // A fetcher that does not stream gives its games at the end.
      if (received === 0) page.forEach(receive)
      await record(max === undefined || page.length < max)
    } catch (error) {
      // Newest first: every game from `to` down to the oldest one received is there.
      if (!(error instanceof GameStoreError)) await record(false).catch(() => {})
      throw error
    }
  }
  report(0, 1)
  return []
}

/**
 * The Chess.com games of the selection, through the store: a past month read more than a day
 * after its end is final and never asked for again (Chess.com caches its data for up to 12 h).
 */
async function findChessComGamesStored(
  username: string,
  selection: GameSelection,
  fetchers: GameFetchers,
  store: GameStore,
  report: Report,
  now: () => number,
  signal?: AbortSignal,
): Promise<ReviewGame[]> {
  const account = accountKey('chesscom', username)
  const { scope } = selection
  const archives = monthsToRead(await fetchers.chessComArchives(username, signal), selection)
  const sync = await store.loadSync(account)
  const found: ReviewGame[] = []
  const limit = scope.kind === 'latest' ? scope.count : scope.max
  report(0, 0)
  for (const [index, archive] of archives.entries()) {
    const month = archiveMonth(archive)
    const key = month && archive.slice(-7)
    const readAt = key ? sync.chesscomMonths?.[key] : undefined
    let games: StoredGame[]
    if (month && readAt !== undefined && readAt > month.end + DAY) {
      games = await store.query(account, month.start, month.end - 1, () => true)
    } else {
      const requestedAt = now()
      const raw = await fetchers.chessComMonth(archive, signal)
      games = (raw ?? []).flatMap((game) => toStoredGame('chesscom', username, game) ?? [])
      await store.put(games)
      // A month Chess.com failed to serve is not marked: read again next time.
      if (key && raw) await store.markMonth(account, key, requestedAt)
    }
    for (const game of games) {
      const summary = storedSummary(game, username)
      if (!summary || !matchesSelection(summary, selection)) continue
      const review = fromChessComGame(game.raw as ChessComGame, username)
      if (review) found.push(review)
    }
    if (limit !== undefined && found.length >= limit) break
    report(
      found.length,
      Math.max(
        limit === undefined ? 0 : share(found.length, limit),
        share(index + 1, archives.length),
      ),
    )
  }
  report(found.length, 1)
  return found
}

/**
 * The games of the selection, all platforms together, newest first: the `count` latest, or those
 * of the date range (the `max` latest, if set). Platforms are searched in parallel, each one sequentially.
 */
export async function findGames(
  accounts: ReviewAccount[],
  selection: GameSelection,
  {
    signal,
    fetchers = API_FETCHERS,
    onProgress,
    store,
    now = Date.now,
  }: {
    signal?: AbortSignal
    fetchers?: GameFetchers
    /** Called as games arrive, with every platform's progress so far */
    onProgress?: (progress: FetchProgress) => void
    /** Where games already fetched are kept (docs/game-store.md); without it, everything is fetched */
    store?: GameStore
    now?: () => number
  } = {},
): Promise<FoundGames> {
  const searched = accounts.filter((account) => selection.sources.includes(account.source))
  let progress: FetchProgress = Object.fromEntries(
    searched.map(({ source }) => [source, { games: 0, ratio: 0 }]),
  )
  const reporter =
    (source: ApiSource): Report =>
    (games, ratio) => {
      if (signal?.aborted) return
      progress = { ...progress, [source]: { games, ratio } }
      onProgress?.(progress)
    }
  const search = async ({ source, username }: ReviewAccount): Promise<ReviewGame[]> => {
    const report = reporter(source)
    if (store) {
      try {
        return source === 'lichess'
          ? await findLichessGamesStored(username, selection, fetchers, store, report, now, signal)
          : await findChessComGamesStored(username, selection, fetchers, store, report, now, signal)
      } catch (error) {
        // The store failed (not the platform): search as without it.
        if (!(error instanceof GameStoreError)) throw error
        console.warn('Game store unavailable', error.cause)
      }
    }
    return source === 'lichess'
      ? findLichessGames(username, selection, fetchers, report, signal)
      : findChessComGames(username, selection, fetchers, report, signal)
  }
  const results = await Promise.allSettled(searched.map(search))
  if (store) {
    for (const { source, username } of searched) {
      store.touch(accountKey(source, username)).catch(() => {})
    }
  }
  signal?.throwIfAborted()
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [{ source: searched[index]!.source, error: result.reason as Error }]
      : [],
  )
  const all = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  const { scope } = selection
  return {
    games: latestGames(all, (scope.kind === 'latest' ? scope.count : scope.max) ?? all.length),
    failures,
  }
}

export type SingleGameFetchers = {
  lichessGame: (id: string, signal?: AbortSignal) => Promise<LichessGame | undefined>
  /** null: a month Chess.com fails to serve (see fetchArchiveGames), skipped */
  chessComMonth: (archiveUrl: string, signal?: AbortSignal) => Promise<ChessComGame[] | null>
}

const SINGLE_GAME_FETCHERS: SingleGameFetchers = {
  lichessGame: exportGame,
  chessComMonth: fetchArchiveGames,
}

/**
 * One game picked in a list (the history), to analyse on its own: no game when it is not one of
 * the accounts' standard games (or no longer found).
 */
export async function findGame(
  accounts: ReviewAccount[],
  ref: GameRef,
  {
    signal,
    fetchers = SINGLE_GAME_FETCHERS,
  }: { signal?: AbortSignal; fetchers?: SingleGameFetchers } = {},
): Promise<FoundGames> {
  // Imported games are not fetched (see library.ts).
  if (ref.source === 'import') return { games: [], failures: [] }
  const source = ref.source
  const account = accounts.find((item) => item.source === source)
  if (!account) return { games: [], failures: [] }
  try {
    let game: ReviewGame | undefined
    if (ref.source === 'lichess') {
      const raw = await fetchers.lichessGame(ref.id, signal)
      game = raw && fromLichessGame(raw, account.username)
    } else {
      const month = await fetchers.chessComMonth(
        archiveUrl(account.username, ref.year, ref.month),
        signal,
      )
      const raw = month?.find((item) => item.uuid === ref.id)
      game = raw && fromChessComGame(raw, account.username)
    }
    return { games: game ? [game] : [], failures: [] }
  } catch (error) {
    signal?.throwIfAborted()
    return { games: [], failures: [{ source, error: error as Error }] }
  }
}
