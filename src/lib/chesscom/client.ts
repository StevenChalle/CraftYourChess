import { withActivity } from '@/lib/activity'
import { fetchJson, orNullIfNotFound } from '@/lib/http'
import type { ChessComGame, ChessComPlayer, ChessComProfile, ChessComStats } from './types'

const BASE_URL = 'https://api.chess.com/pub'

// Chess.com 301-redirects mixed-case usernames to lowercase: skip the extra round trip.
const playerUrl = (username: string) =>
  `${BASE_URL}/player/${encodeURIComponent(username.toLowerCase())}`

// Browsers forbid setting User-Agent, so we cannot identify ourselves as Chess.com asks;
// staying strictly serial keeps us well within their limits.

export function fetchProfile(username: string, signal?: AbortSignal): Promise<ChessComProfile> {
  return fetchJson('chesscom', playerUrl(username), signal)
}

export function fetchStats(username: string, signal?: AbortSignal): Promise<ChessComStats> {
  return fetchJson('chesscom', `${playerUrl(username)}/stats`, signal)
}

/**
 * Profile then stats, one after the other: Chess.com rate-limits parallel requests. Only a missing
 * profile means a missing account: Chess.com also answers 404 ("An internal error has occurred")
 * for the stats of some existing accounts, which then just have no ratings.
 */
export async function fetchPlayer(username: string, signal?: AbortSignal): Promise<ChessComPlayer> {
  const profile = await fetchProfile(username, signal)
  const stats = (await orNullIfNotFound(fetchStats(username, signal))) ?? {}
  return { profile, stats }
}

/**
 * A download of games: an activity of the player (lib/activity.ts), which pauses the background
 * analysis, unless it is the background analysis's own.
 */
const gamesRequest = <T>(background: boolean, task: () => Promise<T>) =>
  background ? task() : withActivity(task)

/** Monthly archive URLs, oldest first. */
export async function fetchArchives(
  username: string,
  signal?: AbortSignal,
  background = false,
): Promise<string[]> {
  const { archives } = await gamesRequest(background, () =>
    fetchJson<{ archives: string[] }>('chesscom', `${playerUrl(username)}/games/archives`, signal),
  )
  return archives
}

/** The monthly archive URL of a month (1 to 12), as listed by fetchArchives. */
export function archiveUrl(username: string, year: number, month: number): string {
  return `${playerUrl(username)}/games/${year}/${String(month).padStart(2, '0')}`
}

/**
 * Games of one monthly archive (a URL from fetchArchives), oldest first. Null when Chess.com
 * answers 404 for it: it happens to a listed month ("An internal error has occurred", seen on the
 * current month of very active accounts), so callers skip that month rather than fail.
 */
export async function fetchArchiveGames(
  archiveUrl: string,
  signal?: AbortSignal,
  background = false,
): Promise<ChessComGame[] | null> {
  const archive = await gamesRequest(background, () =>
    orNullIfNotFound(fetchJson<{ games: ChessComGame[] }>('chesscom', archiveUrl, signal)),
  )
  return archive?.games ?? null
}
