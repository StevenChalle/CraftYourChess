import { describe, expect, it } from 'vitest'
import { PLAYING_RECHECK_MS, RETRY_MS } from '@/features/background/runner'
import { IDLE_REFRESH_MS, periodIsLive, refreshDelay } from './refresh'

const now = Date.UTC(2026, 10, 4, 12)
const minutes = (count: number) => count * 60_000

describe('automatic refresh of the period', () => {
  it('looks every few seconds within an hour of the last game', () => {
    expect(refreshDelay(now - minutes(5), now)).toBe(PLAYING_RECHECK_MS)
    expect(refreshDelay(now - minutes(59), now)).toBe(PLAYING_RECHECK_MS)
  })

  it('looks less often otherwise', () => {
    expect(refreshDelay(now - minutes(61), now)).toBe(IDLE_REFRESH_MS)
    expect(refreshDelay(undefined, now)).toBe(IDLE_REFRESH_MS)
  })

  it('waits a minute after a 429', () => {
    expect(refreshDelay(now - minutes(5), now, true)).toBe(RETRY_MS)
  })

  it('only refreshes periods up to today', () => {
    expect(periodIsLive({ kind: 'last', days: 30 })).toBe(true)
    expect(periodIsLive({ kind: 'lifetime' })).toBe(true)
    expect(periodIsLive({ kind: 'dates', from: '2026-01-01', to: '2026-02-01' })).toBe(false)
  })
})
