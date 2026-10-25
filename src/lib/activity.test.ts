import { describe, expect, it, vi } from 'vitest'
import {
  beginActivity,
  isActiveHere,
  isPlayerActive,
  onActivityChange,
  othersActive,
  waitForOthers,
  watchOthers,
  withActivity,
} from './activity'

describe('activities', () => {
  it('are counted until each one ends, once', async () => {
    const listener = vi.fn<() => void>()
    const unsubscribe = onActivityChange(listener)
    const first = beginActivity()
    const second = beginActivity()
    expect(isActiveHere()).toBe(true)
    first()
    first()
    expect(isActiveHere()).toBe(true)
    second()
    expect(isActiveHere()).toBe(false)
    expect(await isPlayerActive()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(4)
    unsubscribe()
  })

  it('wrap a task, even when it fails', async () => {
    let during = false
    await withActivity(async () => {
      during = isActiveHere()
    })
    expect(during).toBe(true)
    await expect(
      withActivity(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(isActiveHere()).toBe(false)
  })

  it('tell a deepening when another activity starts, then when all is quiet again', async () => {
    vi.useFakeTimers()
    const own = beginActivity()
    expect(await othersActive()).toBe(false)
    const onActive = vi.fn<() => void>()
    const stop = watchOthers(onActive)
    const training = beginActivity()
    expect(onActive).toHaveBeenCalled()
    expect(await othersActive()).toBe(true)
    stop()
    let resumed = false
    void waitForOthers(new AbortController().signal).then(() => (resumed = true))
    await vi.advanceTimersByTimeAsync(4000)
    expect(resumed).toBe(false)
    training()
    await vi.advanceTimersByTimeAsync(4000)
    expect(resumed).toBe(true)
    own()
    vi.useRealTimers()
  })
})
