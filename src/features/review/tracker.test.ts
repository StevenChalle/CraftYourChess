import { describe, expect, it, vi } from 'vitest'
import type { ReviewedGame } from './analyze'
import { DEFAULT_CRITERIA } from './criteria'
import type { ReviewGame } from './games'
import { createTracker, reportAnalysis, sameCriteria, trackedReview } from './tracker'

const review = (mistakes: number) =>
  ({ mistakes: Array.from({ length: mistakes }, () => ({})) }) as unknown as ReviewedGame
const game = (id: string) =>
  ({ source: 'lichess', id, playedAt: new Date(0) }) as unknown as ReviewGame
const STRICT = { ...DEFAULT_CRITERIA, errorMinDrop: DEFAULT_CRITERIA.errorMinDrop + 5 }

describe('createTracker', () => {
  it('follows a game from step to step and tells its listeners', () => {
    const tracker = createTracker()
    const listener = vi.fn<() => void>()
    tracker.subscribe(listener)
    tracker.set('a', { by: 'player', stage: 'quick', done: 1, total: 10 })
    tracker.update('a', { done: 2 })
    expect(tracker.get().active.get('a')).toEqual({
      by: 'player',
      stage: 'quick',
      done: 2,
      total: 10,
    })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps the game judged so far from step to step', () => {
    const tracker = createTracker()
    const judged = review(2)
    tracker.set('a', { by: 'player', stage: 'deepening', done: 0, total: 5, review: judged })
    tracker.set('a', { by: 'player', stage: 'deepening', done: 1, total: 5 })
    expect(tracker.get().active.get('a')?.review).toBe(judged)
  })

  it('changes nothing for a game no longer under way', () => {
    const tracker = createTracker()
    tracker.update('a', { done: 3 })
    expect(tracker.get().active.size).toBe(0)
  })

  it('keeps the last result when a game ends, and moves its revision on', () => {
    const tracker = createTracker()
    tracker.set('a', { by: 'player', stage: 'deep', done: 1, total: 2 })
    const before = tracker.get().revision
    tracker.end('a', { review: review(1), criteria: DEFAULT_CRITERIA })
    expect(tracker.get().active.has('a')).toBe(false)
    expect(tracker.get().results.get('a')?.review.mistakes).toHaveLength(1)
    expect(tracker.get().revision).toBe(before + 1)
  })

  it('keeps an older result when a game ends without one', () => {
    const tracker = createTracker()
    tracker.result('a', review(3), DEFAULT_CRITERIA)
    tracker.set('a', { by: 'player', stage: 'deepening', done: 0, total: 5 })
    tracker.end('a')
    expect(tracker.get().results.get('a')?.review.mistakes).toHaveLength(3)
  })
})

describe('trackedReview', () => {
  it('prefers the game under analysis, then its result here, then the cache', () => {
    const tracker = createTracker()
    const cached = review(5)
    expect(trackedReview(tracker.get(), 'a', DEFAULT_CRITERIA, cached)).toBe(cached)
    const result = review(4)
    tracker.result('a', result, DEFAULT_CRITERIA)
    expect(trackedReview(tracker.get(), 'a', DEFAULT_CRITERIA, cached)).toBe(result)
    const live = review(3)
    tracker.set('a', { by: 'background', stage: 'deepening', done: 1, total: 9, review: live })
    expect(trackedReview(tracker.get(), 'a', DEFAULT_CRITERIA, cached)).toBe(live)
  })

  it('leaves out a result judged with other rules', () => {
    const tracker = createTracker()
    tracker.result('a', review(4), STRICT)
    const cached = review(5)
    expect(trackedReview(tracker.get(), 'a', DEFAULT_CRITERIA, cached)).toBe(cached)
    expect(trackedReview(tracker.get(), 'a', DEFAULT_CRITERIA, undefined)).toBeUndefined()
  })

  it('compares rules by their values', () => {
    expect(sameCriteria({ ...DEFAULT_CRITERIA }, DEFAULT_CRITERIA)).toBe(true)
    expect(sameCriteria(STRICT, DEFAULT_CRITERIA)).toBe(false)
  })
})

describe('reportAnalysis', () => {
  it("tracks each game's steps, and keeps its result once judged", () => {
    const tracker = createTracker()
    const report = reportAnalysis(tracker, [game('g1'), game('g2')], DEFAULT_CRITERIA, 'background')
    report.onGame(0, { stage: 'waiting', done: 0, total: 8 })
    report.onGame(1, { stage: 'quick', done: 3, total: 8 })
    expect([...tracker.get().active.values()].map((item) => item.stage)).toEqual([
      'waiting',
      'quick',
    ])
    expect(tracker.get().active.get('lichess:g2')?.by).toBe('background')
    report.onGame(1, { stage: 'done', review: review(2) })
    expect(tracker.get().active.has('lichess:g2')).toBe(false)
    expect(tracker.get().results.get('lichess:g2')?.review.mistakes).toHaveLength(2)
  })

  it('ends the games left under way when the analysis stops', () => {
    const tracker = createTracker()
    const report = reportAnalysis(tracker, [game('g1')], DEFAULT_CRITERIA, 'player')
    report.onGame(0, { stage: 'quick', done: 3, total: 8 })
    report.close()
    expect(tracker.get().active.size).toBe(0)
    expect(tracker.get().results.size).toBe(0)
  })

  it('leaves a game the player took over when the background analysis stops', () => {
    const tracker = createTracker()
    const report = reportAnalysis(tracker, [game('g1')], DEFAULT_CRITERIA, 'background')
    report.onGame(0, { stage: 'quick', done: 3, total: 8 })
    tracker.set('lichess:g1', { by: 'player', stage: 'waiting', done: 0, total: 0 })
    report.close()
    expect(tracker.get().active.get('lichess:g1')?.by).toBe('player')
  })
})
