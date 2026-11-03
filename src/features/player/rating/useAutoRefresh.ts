import { useEffect, useRef } from 'react'
import { useBackground } from '@/features/background/backgroundContext'
import { isFavorite, useFavorites } from '@/features/background/favorites'
import type { BackgroundPhase } from '@/features/background/runner'
import type { ReviewAccount } from '@/features/review/fetch'
import { refreshDelay } from './refresh'

/** The background analysis works in this tab: it looks for its favorites' games itself */
const RUNNER_WORKING: BackgroundPhase[] = [
  'starting',
  'syncing',
  'analysing',
  'deepening',
  'up-to-date',
]
/** While the background analysis downloads, wait this long: one Lichess request at a time */
const SYNC_WAIT_MS = 2000

/**
 * Looks for the period's new games while the page is shown (refreshDelay: every 15 s while the
 * player is playing), and at once when it is shown again after that delay. A favorite watched by
 * the background analysis in this tab is not looked for twice: the period is read again once the
 * analysis has fetched their games. Never while the background analysis downloads.
 */
export function useAutoRefresh({
  enabled,
  account,
  lastPlayedAt,
  updatedAt,
  rateLimited,
  refetch,
}: {
  /** A period up to today, with its games shown */
  enabled: boolean
  account: ReviewAccount
  /** The period's last game (Unix ms) */
  lastPlayedAt: number | undefined
  /** The last look, its success or its failure (Unix ms) */
  updatedAt: number
  rateLimited: boolean
  refetch: () => void
}) {
  const phase = useBackground()?.state.phase
  const favorites = useFavorites()
  const watched =
    phase !== undefined && RUNNER_WORKING.includes(phase) && isFavorite(favorites, [account])
  // Read by the timers when they fire, not when they are set.
  const live = useRef({ phase, refetch })
  useEffect(() => {
    live.current = { phase, refetch }
  })

  // The background analysis has just fetched this favorite's games: read the period again.
  const previous = useRef(phase)
  useEffect(() => {
    if (enabled && watched && previous.current === 'syncing' && phase !== 'syncing') refetch()
    previous.current = phase
  }, [enabled, watched, phase, refetch])

  useEffect(() => {
    if (!enabled || watched) return
    const delay = refreshDelay(lastPlayedAt, Date.now(), rateLimited)
    let timer: ReturnType<typeof setTimeout> | undefined
    const look = () => {
      if (document.visibilityState !== 'visible') return
      if (live.current.phase === 'syncing') {
        timer = setTimeout(look, SYNC_WAIT_MS)
        return
      }
      live.current.refetch()
    }
    timer = setTimeout(look, Math.max(0, updatedAt + delay - Date.now()))
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - updatedAt >= delay) look()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, watched, lastPlayedAt, updatedAt, rateLimited])
}
