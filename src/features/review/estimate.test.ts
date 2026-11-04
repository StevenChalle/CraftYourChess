import { describe, expect, it } from 'vitest'
import { DEFAULT_CRITERIA } from './criteria'
import {
  workSeconds,
  deepShare,
  desktopSpeedup,
  deviceProfile,
  enginePositions,
  estimateSeconds,
  makespan,
} from './estimate'

const DESKTOP = deviceProfile('desktop', 4)
const MOBILE = deviceProfile('mobile', 4)

const game = (plies: number, serverCps?: (number | undefined)[]) => ({
  sanMoves: Array.from({ length: plies }, () => 'e4'),
  serverCps,
})

describe('enginePositions', () => {
  it('counts every position of an unanalysed game', () => {
    expect(enginePositions(game(80))).toBe(81)
  })

  it('only counts what Lichess did not evaluate, and a set-up start position', () => {
    expect(enginePositions(game(4, [10, 20, undefined, 30]))).toBe(1)
    expect(enginePositions({ ...game(4, [10, 20, undefined, 30]), initialFen: 'x' })).toBe(2)
  })

  it('needs nothing for a game without moves', () => {
    expect(enginePositions(game(0))).toBe(0)
  })
})

describe('makespan', () => {
  it('gives each job, in order, to the first engine free', () => {
    expect(makespan([], 4)).toBe(0)
    expect(makespan([10, 10, 10, 10], 4)).toBe(10)
    // The fifth job waits for an engine
    expect(makespan([10, 10, 10, 10, 10], 4)).toBe(20)
    expect(makespan([30, 10, 10, 10], 2)).toBe(30)
  })
})

describe('estimateSeconds', () => {
  it('matches the desktop measurement: about a minute for 10 blitz games', () => {
    const games = Array.from({ length: 10 }, () => game(97))
    const seconds = estimateSeconds(games, DEFAULT_CRITERIA, DESKTOP)
    expect(seconds).toBeGreaterThan(40)
    expect(seconds).toBeLessThan(80)
  })

  it('uses the engines of the device, at the speed of its kind', () => {
    expect(deviceProfile('desktop', 2)).toEqual({ workers: 2, nodesPerSecond: 825_000 })
    expect(deviceProfile('mobile', 3)).toEqual({ workers: 3, nodesPerSecond: 250_000 })
  })

  it('is slower on mobile', () => {
    const games = Array.from({ length: 10 }, () => game(80))
    expect(estimateSeconds(games, DEFAULT_CRITERIA, MOBILE)).toBeGreaterThan(
      estimateSeconds(games, DEFAULT_CRITERIA, DESKTOP),
    )
  })

  it('keeps a single engine busy for a single game', () => {
    const one = estimateSeconds([game(80)], DEFAULT_CRITERIA, DESKTOP)
    const four = estimateSeconds(
      Array.from({ length: 4 }, () => game(80)),
      DEFAULT_CRITERIA,
      DESKTOP,
    )
    expect(four).toBeCloseTo(one)
    // A fifth game waits for a free engine
    const five = estimateSeconds(
      Array.from({ length: 5 }, () => game(80)),
      DEFAULT_CRITERIA,
      DESKTOP,
    )
    expect(five).toBeCloseTo(2 * one)
  })

  it('grows when lower error thresholds flag more moves for a deep look', () => {
    const games = [game(80)]
    const strict = estimateSeconds(games, { errorMinDrop: 5, validMaxDrop: 3 }, DESKTOP)
    expect(strict).toBeGreaterThan(estimateSeconds(games, DEFAULT_CRITERIA, DESKTOP))
    expect(deepShare(1)).toBeGreaterThan(deepShare(6))
  })

  it('is zero when Lichess already analysed everything', () => {
    expect(estimateSeconds([game(0)], DEFAULT_CRITERIA, DESKTOP)).toBe(0)
  })
})

describe('desktopSpeedup', () => {
  // 8 games: 4 rounds on 2 engines, 2 rounds on 4
  const games = Array.from({ length: 8 }, () => game(80))

  it('tells a phone how much faster a computer would be', () => {
    // 825k vs 250k nodes/s per engine, 4 engines vs 2
    expect(desktopSpeedup(games, DEFAULT_CRITERIA, deviceProfile('mobile', 2))).toBe(7)
  })

  it('only counts busy engines: a single game uses one everywhere', () => {
    expect(desktopSpeedup([game(80)], DEFAULT_CRITERIA, deviceProfile('mobile', 2))).toBe(3)
  })

  it('says nothing when the gain is small or there is nothing to analyse', () => {
    expect(desktopSpeedup(games, DEFAULT_CRITERIA, deviceProfile('desktop', 4))).toBeUndefined()
    expect(desktopSpeedup([game(0)], DEFAULT_CRITERIA, deviceProfile('mobile', 2))).toBeUndefined()
  })
})

describe('workSeconds', () => {
  const device = { workers: 1, nodesPerSecond: 1_000_000 }

  it('costs nothing when everything is in the cache', () => {
    expect(workSeconds({ quick: [], deep: [], fromCache: 500 }, DEFAULT_CRITERIA, device)).toBe(0)
  })

  it('counts the positions left, and the deep pass known exactly', () => {
    // 10 positions at 100,000 nodes, then 10 % of them deeply; 2 known deep positions.
    const seconds = workSeconds({ quick: [10], deep: [2], fromCache: 0 }, DEFAULT_CRITERIA, device)
    expect(seconds).toBeCloseTo(1 + 1 + 2)
  })
})
