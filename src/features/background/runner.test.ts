import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { movesHash } from '@/features/review/cache'
import { DEFAULT_CRITERIA } from '@/features/review/criteria'
import type { ReviewGame } from '@/features/review/games'
import { ApiError } from '@/lib/http'
import type { Favorites } from './favorites'
import {
  BackgroundRunner,
  HEARTBEAT_MS,
  IDLE_MS,
  POLL_MS,
  RECHECK_MS,
  runCycle,
  STALE_MS,
  type BackgroundDeps,
  type BackgroundState,
  type Heartbeat,
  type PlayerProgress,
  type TabChannel,
} from './runner'

const alice = { lichess: 'alice', depth: 50, deep: false }
const profile: Favorites = { players: [alice] }

const game = (id: string) =>
  ({ source: 'lichess', id, sanMoves: ['e4', id], playedAt: new Date(0) }) as unknown as ReviewGame

/** Twelve games, the first three already analysed */
const games = Array.from({ length: 12 }, (_, index) => game(`m${index}`))

let active: boolean
let listeners: Set<() => void>
let analysed: string[][]
/** How long one batch takes */
let batchMs: number

function deps(overrides: Partial<BackgroundDeps> = {}): BackgroundDeps {
  return {
    find: async () => ({ games, failures: [] }),
    // The first three, and those analysed since (the analysis cache keeps them).
    analysed: async () =>
      new Set(
        [...games.slice(0, 3).map((g) => g.id), ...analysed.flat()].map((id) =>
          movesHash(['e4', id]),
        ),
      ),
    analyze: (batch, _criteria, signal) =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          analysed.push(batch.map((g) => g.id))
          resolve()
        }, batchMs)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(signal.reason)
        })
      }),
    criteria: () => DEFAULT_CRITERIA,
    toDeepen: async () => new Set(),
    deepen: async () => {},
    isPlayerActive: async () => active,
    isActiveHere: () => active,
    onActivityChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    sleep: (ms, signal) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        })
      }),
    isVisible: () => true,
    now: () => Date.now(),
    ...overrides,
  }
}

/**
 * Web Locks with a single exclusive lock: waiting in turn, `signal` to give up, `steal`. With
 * `lateAborts`, giving up does not take a request out of the queue (Chrome, right after asking).
 */
function fakeLocks({ lateAborts = false } = {}) {
  let held: object | undefined
  const queue: { grant: () => void }[] = []
  const next = () => queue.shift()?.grant()
  const abortError = () => new DOMException('Aborted', 'AbortError')
  return {
    get held() {
      return held !== undefined
    },
    get waiting() {
      return queue.length
    },
    request: (_name: string, options: LockOptions, callback: () => Promise<unknown>) =>
      new Promise((resolve, reject) => {
        const me = { reject }
        const entry = {
          grant: () => {
            held = me
            Promise.resolve()
              .then(callback)
              .then((value) => {
                if (held === me) {
                  held = undefined
                  next()
                }
                resolve(value)
              }, reject)
          },
        }
        if (options.steal) {
          const previous = held as typeof me | undefined
          held = undefined
          previous?.reject(abortError())
          entry.grant()
        } else if (held) {
          queue.push(entry)
          if (!lateAborts)
            options.signal?.addEventListener('abort', () => {
              const index = queue.indexOf(entry)
              if (index >= 0) {
                queue.splice(index, 1)
                reject(abortError())
              }
            })
        } else {
          entry.grant()
        }
      }),
  }
}

/** Heartbeats between tabs: each one hears the others. */
function fakeChannels() {
  const tabs = new Set<(heartbeat: Heartbeat) => void>()
  return () => {
    let mine: ((heartbeat: Heartbeat) => void) | undefined
    const channel: TabChannel = {
      post: (heartbeat) => {
        for (const listener of tabs) if (listener !== mine) listener(heartbeat)
      },
      listen: (listener) => {
        mine = listener
        tabs.add(listener)
        return () => tabs.delete(listener)
      },
    }
    return channel
  }
}

const setActive = (value: boolean) => {
  active = value
  for (const listener of listeners) listener()
}

beforeEach(() => {
  vi.useFakeTimers()
  active = false
  listeners = new Set()
  analysed = []
  batchMs = 1000
})

afterEach(() => vi.useRealTimers())

describe('runCycle', () => {
  it('analyses the games not analysed yet, newest first, a few at a time', async () => {
    const states: BackgroundState[] = []
    const cycle = runCycle(profile, deps(), new AbortController().signal, (state) =>
      states.push(state),
    )
    await vi.runAllTimersAsync()
    expect(await cycle).toEqual({ rateLimited: false })
    expect(analysed).toEqual([
      ['m3', 'm4', 'm5', 'm6', 'm7'],
      ['m8', 'm9', 'm10', 'm11'],
    ])
    expect(
      states
        .filter((state) => state.current === undefined)
        .map(({ phase, done }) => `${phase}:${done ?? ''}`),
    ).toEqual(['syncing:', 'syncing:', 'analysing:3', 'analysing:8', 'analysing:12'])
  })

  it('then evaluates every position deeply, once all the games are analysed', async () => {
    const order: string[] = []
    const states: BackgroundState[] = []
    const cycle = runCycle(
      { players: [{ ...alice, deep: true }] },
      deps({
        analyze: async (batch) => {
          order.push(`analyse ${batch.length}`)
        },
        // Only the last five games still need it.
        toDeepen: async (all) => new Set(all.slice(7).map((g) => movesHash(g.sanMoves))),
        deepen: async (batch, _signal, onProgress) => {
          onProgress(0.5)
          order.push(`deepen ${batch.map((g) => g.id).join(',')}`)
        },
      }),
      new AbortController().signal,
      (state) => states.push(state),
    )
    await vi.runAllTimersAsync()
    await cycle
    expect(order).toEqual(['analyse 5', 'analyse 4', 'deepen m7,m8', 'deepen m9,m10', 'deepen m11'])
    expect(states.at(-1)).toMatchObject({ phase: 'deepening', done: 12, total: 12 })
    expect(states).toContainEqual(
      expect.objectContaining({ phase: 'deepening', done: 7, total: 12, current: 1 }),
    )
  })

  it("asks for each favorite's latest games, all their platforms together", async () => {
    const find = vi.fn<BackgroundDeps['find']>(async () => ({ games: [], failures: [] }))
    await runCycle(
      {
        players: [
          { lichess: 'alice', chesscom: 'alice_cc', depth: 200, deep: false },
          { chesscom: 'bob', depth: 50, deep: false },
        ],
      },
      deps({ find }),
      new AbortController().signal,
      () => {},
    )
    expect(find).toHaveBeenCalledTimes(2)
    const [accounts, selection] = find.mock.calls[0]!
    expect(accounts.map((account) => account.username)).toEqual(['alice', 'alice_cc'])
    expect(selection.scope).toEqual({ kind: 'latest', count: 200 })
    expect(find.mock.calls[1]![0].map((account) => account.username)).toEqual(['bob'])
    expect(find.mock.calls[1]![1].scope).toEqual({ kind: 'latest', count: 50 })
  })

  it('counts a game between two favorites once', async () => {
    const shared = game('shared')
    const find = vi.fn<BackgroundDeps['find']>(async (accounts) => ({
      games: accounts[0]!.username === 'alice' ? [shared, game('a1')] : [shared, game('b1')],
      failures: [],
    }))
    const analyze = vi.fn<BackgroundDeps['analyze']>(async () => {})
    const states: BackgroundState[] = []
    const cycle = runCycle(
      { players: [alice, { ...alice, lichess: 'bob' }] },
      deps({ find, analyze, analysed: async () => new Set() }),
      new AbortController().signal,
      (state) => states.push(state),
    )
    await vi.runAllTimersAsync()
    await cycle
    expect(analyze.mock.calls[0]![0].map((g) => g.id)).toEqual(['shared', 'a1', 'b1'])
    expect(states.at(-1)).toMatchObject({ phase: 'analysing', done: 3, total: 3 })
  })

  it('deepens only the games of the favorites with the deep option, shared ones included', async () => {
    const shared = game('shared')
    const find = vi.fn<BackgroundDeps['find']>(async (accounts) => ({
      games: accounts[0]!.username === 'alice' ? [shared, game('a1')] : [shared, game('b1')],
      failures: [],
    }))
    const deepen = vi.fn<BackgroundDeps['deepen']>(async () => {})
    const states: BackgroundState[] = []
    const cycle = runCycle(
      { players: [alice, { ...alice, lichess: 'bob', deep: true }] },
      deps({
        find,
        deepen,
        toDeepen: async (all) => new Set(all.map((g) => movesHash(g.sanMoves))),
      }),
      new AbortController().signal,
      (state) => states.push(state),
    )
    await vi.runAllTimersAsync()
    await cycle
    expect(deepen.mock.calls.flatMap(([batch]) => batch.map((g) => g.id))).toEqual(['shared', 'b1'])
    expect(states.at(-1)).toMatchObject({ phase: 'deepening', done: 2, total: 2 })
  })

  it('says how far each favorite is: loading until their games are fetched, then their counts', async () => {
    const bob = { ...alice, lichess: 'bob', depth: 200, deep: true }
    const find = vi.fn<BackgroundDeps['find']>(async (accounts) => ({
      games: accounts[0]!.username === 'alice' ? games.slice(0, 4) : games.slice(2, 6),
      failures: [],
    }))
    const states: BackgroundState[] = []
    const cycle = runCycle(
      { players: [alice, bob] },
      deps({
        find,
        // Bob's m4 and m5 were deepened before.
        toDeepen: async (all) =>
          new Set(
            all.filter((g) => !['m4', 'm5'].includes(g.id)).map((g) => movesHash(g.sanMoves)),
          ),
      }),
      new AbortController().signal,
      (state) => states.push(state),
      // Alice's counts from the last pass show until her games are fetched.
      [{ name: 'alice', max: 50, games: 4, analysed: 2, loading: false }],
    )
    await vi.runAllTimersAsync()
    await cycle
    const players = states.map((state) => state.players!)
    expect(players[0]).toEqual([
      { name: 'alice', max: 50, games: 4, analysed: 2, loading: true },
      { name: 'bob', max: 200, games: 0, analysed: 0, deepened: 0, loading: true },
    ])
    expect(players[1]!.map((player) => player.loading)).toEqual([false, true])
    // Analysed: m0 to m2. Alice 3 of 4; Bob m2 analysed, m4 and m5 deepened, of 4.
    const counts = ({ games, analysed, deepened }: PlayerProgress) => ({
      games,
      analysed,
      deepened,
    })
    expect(states.find((state) => state.phase === 'analysing')!.players!.map(counts)).toEqual([
      { games: 4, analysed: 3, deepened: undefined },
      { games: 4, analysed: 1, deepened: 2 },
    ])
    expect(players.at(-1)!.map(counts)).toEqual([
      { games: 4, analysed: 4, deepened: undefined },
      { games: 4, analysed: 4, deepened: 4 },
    ])
  })

  it('deepens nothing while some games could not be fetched: they are analysed first', async () => {
    const deepen = vi.fn<BackgroundDeps['deepen']>(async () => {})
    const find = async () => ({
      games,
      failures: [{ source: 'lichess' as const, error: new ApiError('lichess', 429, 'Too many') }],
    })
    const cycle = runCycle(
      { players: [{ ...alice, deep: true }] },
      deps({
        find,
        deepen,
        toDeepen: async (all) => new Set(all.map((g) => movesHash(g.sanMoves))),
      }),
      new AbortController().signal,
      () => {},
    )
    await vi.runAllTimersAsync()
    await cycle
    expect(analysed.flat()).toHaveLength(9)
    expect(deepen).not.toHaveBeenCalled()
  })

  it('says when Lichess limits the requests', async () => {
    const find = async () => ({
      games: [],
      failures: [{ source: 'lichess' as const, error: new ApiError('lichess', 429, 'Too many') }],
    })
    expect(await runCycle(profile, deps({ find }), new AbortController().signal, () => {})).toEqual(
      { rateLimited: true },
    )
  })
})

describe('BackgroundRunner', () => {
  it('gives way to the player at once, then starts again once they are done', async () => {
    const runner = new BackgroundRunner(profile, deps())
    runner.start()
    await vi.advanceTimersByTimeAsync(batchMs + 10)
    expect(analysed).toHaveLength(1)

    setActive(true)
    await vi.advanceTimersByTimeAsync(10)
    expect(runner.getState().phase).toBe('busy')
    await vi.advanceTimersByTimeAsync(5 * batchMs)
    expect(analysed).toHaveLength(1)

    setActive(false)
    await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS + batchMs + 10)
    expect(analysed).toHaveLength(2)
    expect(runner.getState()).toMatchObject({ phase: 'up-to-date', done: 12, total: 12 })
    runner.stop()
  })

  it('pauses and resumes when the player asks', async () => {
    const runner = new BackgroundRunner(profile, deps())
    runner.start()
    await vi.advanceTimersByTimeAsync(10)
    runner.pause()
    await vi.advanceTimersByTimeAsync(10 * batchMs)
    expect(analysed).toEqual([])
    expect(runner.getState().phase).toBe('paused')
    runner.resume()
    await vi.advanceTimersByTimeAsync(3 * batchMs)
    expect(analysed).toHaveLength(2)
    runner.stop()
  })

  it('looks for new games again later', async () => {
    const find = vi.fn<BackgroundDeps['find']>(async () => ({ games: [], failures: [] }))
    const runner = new BackgroundRunner(profile, deps({ find }))
    runner.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(find).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(find).toHaveBeenCalledTimes(2)
    runner.wakeUp()
    await vi.advanceTimersByTimeAsync(10)
    expect(find).toHaveBeenCalledTimes(3)
    runner.stop()
  })
})

describe('BackgroundRunner across tabs', () => {
  const quietFind = () => vi.fn<BackgroundDeps['find']>(async () => ({ games: [], failures: [] }))

  it('takes the work back from a stuck tab that keeps the lock', async () => {
    const locks = fakeLocks()
    // A frozen tab: holds the lock, never says anything.
    locks
      .request('craftyourchess:background', {}, () => new Promise(() => {}))
      // Rejected when the work is taken back.
      .catch(() => {})
    const find = quietFind()
    const runner = new BackgroundRunner(
      profile,
      deps({ find, locks: locks as unknown as LockManager }),
    )
    runner.start()
    await vi.advanceTimersByTimeAsync(STALE_MS - POLL_MS)
    expect(runner.getState().phase).toBe('elsewhere')
    expect(find).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2 * POLL_MS)
    expect(find).toHaveBeenCalledTimes(1)
    runner.stop()
  })

  it('leaves the work to a shown tab that is alive, and takes it from a hidden one', async () => {
    const locks = fakeLocks() as unknown as LockManager
    const channel = fakeChannels()
    let firstShown = true
    const firstFind = quietFind()
    const first = new BackgroundRunner(
      profile,
      deps({ find: firstFind, locks, channel: channel(), isVisible: () => firstShown }),
    )
    first.start()
    await vi.advanceTimersByTimeAsync(10)
    expect(firstFind).toHaveBeenCalledTimes(1)

    const secondFind = quietFind()
    const second = new BackgroundRunner(
      profile,
      deps({ find: secondFind, locks, channel: channel() }),
    )
    second.start()
    await vi.advanceTimersByTimeAsync(3 * STALE_MS)
    expect(second.getState().phase).toBe('elsewhere')
    expect(secondFind).not.toHaveBeenCalled()

    // The waiting tab shows the working tab's progress.
    expect(second.getState()).toMatchObject({ phase: 'elsewhere', done: 0, total: 0 })

    // The first tab is hidden now: its next heartbeat says so, and the shown one takes over.
    firstShown = false
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS + POLL_MS)
    expect(secondFind).toHaveBeenCalledTimes(1)
    expect(first.getState().phase).toBe('elsewhere')
    // The first tab waits again, with a single request.
    expect((locks as unknown as { waiting: number }).waiting).toBe(1)
    first.stop()
    second.stop()
  })

  it('does nothing with a request granted after it was given up', async () => {
    // As in Chrome when the abort comes right after the request: it stays queued.
    const locks = fakeLocks({ lateAborts: true })
    void locks.request('craftyourchess:background', {}, () => new Promise(() => {})).catch(() => {})
    const find = quietFind()
    const runner = new BackgroundRunner(
      profile,
      deps({ find, locks: locks as unknown as LockManager }),
    )
    runner.start()
    // The stuck holder is taken over; the first request is given up but stays queued.
    await vi.advanceTimersByTimeAsync(STALE_MS + 2 * POLL_MS)
    expect(find).toHaveBeenCalledTimes(1)

    // A third tab takes the lock for a moment: the runner waits again, behind its old request.
    let release: () => void = () => {}
    void locks.request(
      'craftyourchess:background',
      { steal: true },
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    await vi.advanceTimersByTimeAsync(10)
    find.mockClear()
    release()
    await vi.advanceTimersByTimeAsync(10)
    // The old request is granted first and released at once: a single loop runs, and the tab
    // does not keep taking the lock from itself.
    await vi.advanceTimersByTimeAsync(3 * STALE_MS)
    expect(find).toHaveBeenCalledTimes(1)
    expect(runner.getState().phase).not.toBe('elsewhere')
    runner.stop()
  })
})
