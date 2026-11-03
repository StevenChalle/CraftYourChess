import { PLAYING_MS, PLAYING_RECHECK_MS, RETRY_MS } from '@/features/background/runner'
import type { RatingPeriod } from './history'

/** No game in the last hour: the period's games are looked for again this often */
export const IDLE_REFRESH_MS = 2 * 60_000

/**
 * When to look for the period's new games again, after the last look: as the background analysis
 * watches a favorite (every 15 s within an hour of their last game), every 2 min otherwise, a
 * minute after a 429.
 */
export function refreshDelay(
  lastPlayedAt: number | undefined,
  now: number,
  rateLimited = false,
): number {
  if (rateLimited) return RETRY_MS
  return lastPlayedAt !== undefined && now - lastPlayedAt < PLAYING_MS
    ? PLAYING_RECHECK_MS
    : IDLE_REFRESH_MS
}

/** Only a period up to today can get new games (dates in the past stay as they are). */
export function periodIsLive(period: RatingPeriod): boolean {
  return period.kind !== 'dates'
}
