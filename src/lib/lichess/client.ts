import { withActivity } from '@/lib/activity'
import { fetchJson, fetchOk } from '@/lib/http'
import type { LichessGame, LichessUser } from './types'

const BASE_URL = 'https://lichess.org'

export function fetchUser(username: string, signal?: AbortSignal): Promise<LichessUser> {
  return fetchJson('lichess', `${BASE_URL}/api/user/${encodeURIComponent(username)}`, signal)
}

/** Standard chess only: variants are left out of the export by listing these perfs. */
const STANDARD_PERFS = 'ultraBullet,bullet,blitz,rapid,classical,correspondence'

/**
 * Streams a game export (NDJSON) with the given query parameters, newest first. An activity of
 * the player (lib/activity.ts), which pauses the background analysis, unless it is its own.
 */
function exportGames(
  username: string,
  params: Record<string, string>,
  signal?: AbortSignal,
  onGame?: (game: LichessGame) => void,
  background = false,
): Promise<LichessGame[]> {
  const task = () => streamExport(username, params, signal, onGame)
  return background ? task() : withActivity(task)
}

async function streamExport(
  username: string,
  params: Record<string, string>,
  signal?: AbortSignal,
  onGame?: (game: LichessGame) => void,
): Promise<LichessGame[]> {
  const query = new URLSearchParams(params)
  const url = `${BASE_URL}/api/games/user/${encodeURIComponent(username)}?${query}`
  const response = await fetchOk('lichess', url, {
    signal,
    headers: { Accept: 'application/x-ndjson' },
  })
  const games: LichessGame[] = []
  if (!response.body) return games
  for await (const game of readNdjson<LichessGame>(response.body)) {
    games.push(game)
    onGame?.(game)
  }
  return games
}

export type GameExportOptions = {
  /** Lichess perf keys (ultraBullet, bullet, blitz, rapid, classical, correspondence) */
  perfTypes: string[]
  /** At most this many games; all of them when omitted */
  max?: number
  /** Games started at or after this date (Unix ms) */
  since?: number
  /** Games started at or before this date (Unix ms) */
  until?: number
  /** Only the games played with this color */
  color?: 'white' | 'black'
  /** Only rated (true) or only casual (false) games; both when omitted */
  rated?: boolean
}

/** Query parameters of a standard games export, with moves, Lichess evaluations and clocks. */
export function exportParams(options: GameExportOptions): Record<string, string> {
  const params: Record<string, string> = {
    perfType: options.perfTypes.join(','),
    evals: 'true',
    clocks: 'true',
  }
  if (options.rated !== undefined) params.rated = String(options.rated)
  if (options.max !== undefined) params.max = String(options.max)
  if (options.since !== undefined) params.since = String(options.since)
  if (options.until !== undefined) params.until = String(options.until)
  if (options.color) params.color = options.color
  return params
}

/**
 * Standard games matching `options`, newest first. A single streamed request: never run
 * several Lichess exports at once. `onGame` reports each game as it arrives (about 20 per second).
 * `background`: the background analysis's own export, which any other one interrupts.
 */
export function exportStandardGames(
  username: string,
  options: GameExportOptions,
  signal?: AbortSignal,
  onGame?: (game: LichessGame) => void,
  background = false,
): Promise<LichessGame[]> {
  return exportGames(username, exportParams(options), signal, onGame, background)
}

/**
 * One game, with moves, Lichess evaluations and clocks; undefined if it does not exist. Exported by
 * id list: from a browser, /game/export/{id} answers 401 in JSON (see docs/apis.md).
 */
export function exportGame(id: string, signal?: AbortSignal): Promise<LichessGame | undefined> {
  return withActivity(() => exportOneGame(id, signal))
}

async function exportOneGame(id: string, signal?: AbortSignal): Promise<LichessGame | undefined> {
  const query = new URLSearchParams({ evals: 'true', clocks: 'true' })
  const response = await fetchOk('lichess', `${BASE_URL}/api/games/export/_ids?${query}`, {
    method: 'POST',
    body: id,
    signal,
    headers: { Accept: 'application/x-ndjson', 'Content-Type': 'text/plain' },
  })
  if (!response.body) return undefined
  for await (const game of readNdjson<LichessGame>(response.body)) return game
  return undefined
}

/**
 * One page of the game history: standard games, rated or casual (like the review), newest first,
 * without moves. `until` (Unix ms, exclusive upper bound on the start date) pages backwards.
 * `perfTypes`: only these Lichess perfs (standard ones), instead of all of them.
 */
export function fetchGamesPage(
  username: string,
  max: number,
  until: number | undefined,
  signal?: AbortSignal,
  perfTypes?: string[],
): Promise<LichessGame[]> {
  const params: Record<string, string> = {
    max: String(max),
    moves: 'false',
    perfType: perfTypes?.join(',') ?? STANDARD_PERFS,
  }
  if (until !== undefined) params.until = String(until)
  return exportGames(username, params, signal)
}

/**
 * Parses a newline-delimited JSON stream, yielding one object per line as it arrives.
 * Used for game exports, which can take minutes for a whole career.
 */
export async function* readNdjson<T>(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
): AsyncGenerator<T> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) yield JSON.parse(line) as T
      }
    }
    if (buffer.trim()) yield JSON.parse(buffer) as T
  } finally {
    reader.releaseLock()
  }
}
