import { describe, expect, it, vi } from 'vitest'
import { judge, shallowPositions, type ReviewedGame } from './analyze'
import { DEFAULT_CRITERIA } from './criteria'
import { gameRef } from './gameRef'
import type { ReviewGame } from './games'
import { createPlayerAnalysis, type PlayerAnalysisDeps } from './playerAnalysis'
import { replay } from './positions'
import { createTracker } from './tracker'

/** Black blunders with 3... Nf6?? (4. Qxf7#). */
const SCHOLAR = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']

const game = (id: string) =>
  ({
    source: 'lichess',
    id,
    playedAt: new Date(0),
    color: 'black',
    opponent: { name: 'bob' },
    sanMoves: SCHOLAR,
  }) as unknown as ReviewGame

/**
 * The game as its quick analysis judges it: 3... Nf6 an error (+20 after it), every position but
 * the first and the last only looked at quickly.
 */
function quickReview(base: ReviewGame): ReviewedGame {
  const positions = replay(SCHOLAR).map((position, index) => ({
    ...position,
    cp: index === 6 ? 2000 : index === 7 ? 10000 : 0,
    precise: index === 0 || index === 7,
  }))
  return judge(base, positions, DEFAULT_CRITERIA)
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Fake engines and activities: each step waits a tick; others' activities are switched by hand. */
function setup({ deepCp = () => 0 }: { deepCp?: (index: number) => number } = {}) {
  const tracker = createTracker()
  let othersBusy = false
  const watchers = new Set<() => void>()
  let release: (() => void) | undefined
  const analyzed: string[] = []
  const deepened: string[] = []
  const deps: PlayerAnalysisDeps = {
    analyze: async (base, _criteria, { signal, onGame }) => {
      analyzed.push(base.id)
      onGame(0, { stage: 'quick', done: 0, total: 7 })
      await tick()
      signal.throwIfAborted()
      onGame(0, { stage: 'deep', done: 1, total: 2 })
      await tick()
      signal.throwIfAborted()
      const review = quickReview(base)
      onGame(0, { stage: 'done', review })
      return review
    },
    deepen: async (reviewed, { signal, onPosition }) => {
      deepened.push(reviewed.id)
      for (const index of shallowPositions(reviewed)) {
        await tick()
        signal.throwIfAborted()
        onPosition(index, deepCp(index))
      }
    },
    beginActivity: () => () => {},
    watchOthers: (onActive) => {
      watchers.add(onActive)
      if (othersBusy) onActive()
      return () => watchers.delete(onActive)
    },
    waitForOthers: (signal) =>
      new Promise((resolve) => {
        if (!othersBusy || signal.aborted) return resolve()
        release = resolve
        signal.addEventListener('abort', () => resolve(), { once: true })
      }),
  }
  const onDeepened = vi.fn<(ref: string, game: ReviewedGame) => void>()
  const queue = createPlayerAnalysis(tracker, deps, onDeepened)
  /** Another use of Stockfish starts, or ends */
  const others = (busy: boolean) => {
    othersBusy = busy
    if (busy) for (const watcher of [...watchers]) watcher()
    else release?.()
  }
  /** Lets the queue run until nothing is left */
  const settle = async () => {
    for (let index = 0; index < 200; index++) {
      const state = queue.get()
      if (state.analysing.length === 0 && !state.deepening && state.waiting.length === 0) return
      await tick()
    }
    throw new Error('The queue never settled')
  }
  return { tracker, queue, analyzed, deepened, others, settle, onDeepened }
}

describe('createPlayerAnalysis', () => {
  it("tracks a game's analysis, then deepens it on its own", async () => {
    const { tracker, queue, deepened, settle } = setup()
    const ref = gameRef(game('g1'))
    const stages: string[] = []
    tracker.subscribe(() => {
      const stage = tracker.get().active.get(ref)?.stage
      if (stage && stages.at(-1) !== stage) stages.push(stage)
    })
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    await settle()
    expect(stages).toEqual(['waiting', 'quick', 'deep', 'waiting', 'deepening'])
    expect(deepened).toEqual(['g1'])
    // Done: nothing under way, every position deep, the result kept.
    expect(tracker.get().active.size).toBe(0)
    const result = tracker.get().results.get(ref)!.review
    expect(shallowPositions(result)).toEqual([])
  })

  it('shows the result of the two passes before the deepening ends', async () => {
    const { tracker, queue, settle } = setup()
    const ref = gameRef(game('g1'))
    let seen: ReviewedGame | undefined
    tracker.subscribe(() => {
      const active = tracker.get().active.get(ref)
      if (active?.stage === 'deepening' && !seen) seen = active.review
    })
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    await settle()
    expect(seen?.mistakes.map((mistake) => mistake.ply)).toEqual([5])
  })

  it('counts the errors again as the deepening finds them', async () => {
    // Deep, 3... Nf6 is no error: the position after it is level.
    const { tracker, queue, settle, onDeepened } = setup({ deepCp: () => 0 })
    const ref = gameRef(game('g1'))
    const counts: number[] = []
    tracker.subscribe(() => {
      const review = tracker.get().active.get(ref)?.review
      if (review && counts.at(-1) !== review.mistakes.length) counts.push(review.mistakes.length)
    })
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    await settle()
    expect(counts).toEqual([1, 0])
    expect(tracker.get().results.get(ref)?.review.mistakes).toEqual([])
    expect(onDeepened).toHaveBeenCalledTimes(6)
  })

  it('analyses the games in the order asked, then deepens them in that order', async () => {
    const { tracker, queue, analyzed, deepened, settle } = setup()
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    queue.analyze(game('g2'), DEFAULT_CRITERIA)
    // The second one waits for its turn.
    expect(queue.get().analysing).toEqual([gameRef(game('g1')), gameRef(game('g2'))])
    await tick()
    expect(tracker.get().active.get(gameRef(game('g2')))?.stage).toBe('waiting')
    await settle()
    expect(analyzed).toEqual(['g1', 'g2'])
    expect(deepened).toEqual(['g1', 'g2'])
  })

  it('asks for a game only once while it is analysed', async () => {
    const { queue, analyzed, settle } = setup()
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    await settle()
    expect(analyzed).toEqual(['g1'])
  })

  it('does not deepen a game when asked not to', async () => {
    const { queue, deepened, settle } = setup()
    queue.analyze(game('g1'), DEFAULT_CRITERIA, { deepen: false })
    await settle()
    expect(deepened).toEqual([])
  })

  it('gives way to another use of Stockfish, then goes on', async () => {
    const { tracker, queue, others, settle } = setup()
    const ref = gameRef(game('g1'))
    queue.deepen([{ game: quickReview(game('g1')), criteria: DEFAULT_CRITERIA }], 'game')
    await tick()
    await tick()
    others(true)
    for (let index = 0; index < 5; index++) await tick()
    expect(queue.get().deepening?.paused).toBe(true)
    expect(tracker.get().active.get(ref)?.paused).toBe(true)
    const doneWhilePaused = queue.get().deepening!.done
    for (let index = 0; index < 5; index++) await tick()
    expect(queue.get().deepening!.done).toBe(doneWhilePaused)
    others(false)
    await settle()
    expect(shallowPositions(tracker.get().results.get(ref)!.review)).toEqual([])
  })

  it('stops a deepening and keeps what it found, then deepens the next game', async () => {
    const { tracker, queue, deepened, settle } = setup()
    const first = gameRef(game('g1'))
    queue.deepen(
      [
        { game: quickReview(game('g1')), criteria: DEFAULT_CRITERIA },
        { game: quickReview(game('g2')), criteria: DEFAULT_CRITERIA },
      ],
      'all',
    )
    await tick()
    await tick()
    await tick()
    queue.stop(first)
    await settle()
    const kept = tracker.get().results.get(first)!.review
    // Some positions deepened before the stop, not all of them.
    expect(shallowPositions(kept).length).toBeGreaterThan(0)
    expect(shallowPositions(kept).length).toBeLessThan(6)
    expect(deepened).toEqual(['g1', 'g2'])
    expect(shallowPositions(tracker.get().results.get(gameRef(game('g2')))!.review)).toEqual([])
  })

  it('drops a waiting deepening when it is stopped', async () => {
    const { tracker, queue, deepened, settle } = setup()
    queue.deepen(
      [
        { game: quickReview(game('g1')), criteria: DEFAULT_CRITERIA },
        { game: quickReview(game('g2')), criteria: DEFAULT_CRITERIA },
      ],
      'all',
    )
    queue.stop(gameRef(game('g2')))
    expect(tracker.get().active.has(gameRef(game('g2')))).toBe(false)
    await settle()
    expect(deepened).toEqual(['g1'])
  })

  it("replaces a scope's deepenings, and leaves the others", async () => {
    const { queue, deepened, settle } = setup()
    const entry = (id: string) => ({ game: quickReview(game(id)), criteria: DEFAULT_CRITERIA })
    queue.deepen([entry('a1'), entry('a2')], 'all')
    queue.deepen([entry('g1')], 'game')
    // The advanced analysis's games again, another one first.
    queue.deepen([entry('a3'), entry('a2')], 'all', { replace: true })
    expect(queue.get().waiting.map((item) => item.ref)).toEqual([
      gameRef(game('g1')),
      gameRef(game('a3')),
      gameRef(game('a2')),
    ])
    await settle()
    // a1 had started: it stopped for the new ones.
    expect(deepened).toEqual(['a1', 'g1', 'a3', 'a2'])
  })

  it('stops every deepening of a scope', async () => {
    const { queue, deepened, settle } = setup()
    const entry = (id: string) => ({ game: quickReview(game(id)), criteria: DEFAULT_CRITERIA })
    queue.deepen([entry('a1'), entry('a2')], 'all')
    queue.deepen([entry('g1')], 'game')
    queue.stopScope('all')
    await settle()
    expect(deepened).toEqual(['a1', 'g1'])
  })

  it('stops an analysis under way, with no deepening after it', async () => {
    const { tracker, queue, deepened, settle } = setup()
    const ref = gameRef(game('g1'))
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    await tick()
    queue.stop(ref)
    await settle()
    expect(deepened).toEqual([])
    expect(tracker.get().active.has(ref)).toBe(false)
    expect(queue.get().failed.has(ref)).toBe(false)
  })

  it('says when an analysis failed, and tries again when asked', async () => {
    const { tracker, queue, settle } = setup()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ref = gameRef(game('g1'))
    const failing = createPlayerAnalysis(tracker, {
      analyze: () => Promise.reject(new Error('no engine')),
      deepen: async () => {},
      beginActivity: () => () => {},
      watchOthers: () => () => {},
      waitForOthers: async () => {},
    })
    failing.analyze(game('g1'), DEFAULT_CRITERIA)
    for (let index = 0; index < 5; index++) await tick()
    expect(failing.get().failed.has(ref)).toBe(true)
    expect(tracker.get().active.has(ref)).toBe(false)
    failing.analyze(game('g1'), DEFAULT_CRITERIA)
    expect(failing.get().failed.has(ref)).toBe(false)
    await settle()
    error.mockRestore()
    void queue
  })

  it('stops everything when the page goes away', async () => {
    const { tracker, queue, deepened, settle } = setup()
    queue.analyze(game('g1'), DEFAULT_CRITERIA)
    queue.analyze(game('g2'), DEFAULT_CRITERIA)
    await tick()
    queue.stopAll()
    await settle()
    expect(deepened).toEqual([])
    expect(tracker.get().active.size).toBe(0)
  })
})
