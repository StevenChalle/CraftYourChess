import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDatabase, DB_NAME } from '@/lib/db'
import { EnginePool } from '@/lib/engine/pool'
import type { Stockfish } from '@/lib/engine/stockfish'
import type { EngineScore } from '@/lib/engine/uci'
import {
  analysisWorkLeft,
  analyzeGames,
  DEEP_NODES,
  deepenGame,
  deepenPositions,
  gamesToDeepen,
  QUICK_NODES,
  reviewFromCache,
} from './analyze'
import { createCache, positionKey, type EvaluationCache } from './cache'
import { DEFAULT_CRITERIA } from './criteria'
import type { ReviewGame } from './games'
import { replay } from './positions'
import type { ReviewProgress } from './progress'

vi.mock('@/lib/engine/pool', () => ({
  defaultPoolSize: () => 2,
  EnginePool: { start: vi.fn<() => Promise<unknown>>() },
}))

const game = (id: string, sanMoves: string[], color: 'white' | 'black' = 'black') =>
  ({
    source: 'lichess',
    id,
    url: `https://lichess.org/${id}`,
    playedAt: new Date(0),
    color,
    opponent: { name: 'bob' },
    sanMoves,
  }) as unknown as ReviewGame

/** Black blunders with 3... Nf6?? (4. Qxf7#): the position after it is mate in 1 for White. */
const SCHOLAR = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']
const MATE_IN_ONE = positionKey(replay(SCHOLAR)[6]!.fen)

/** Every search, as (position, nodes) */
let searches: { key: string; nodes: number }[]
/** Makes the engine fail after this many searches, as when the analysis is stopped */
let failAfter: number

const engine = {
  newGame: async () => {},
  evaluate: async (fen: string, nodes: number) => {
    if (searches.length >= failAfter) throw new Error('Engine terminated')
    searches.push({ key: positionKey(fen), nodes })
    const score: EngineScore = positionKey(fen) === MATE_IN_ONE ? { mate: 1 } : { cp: 0 }
    return { score, bestMove: 'e2e4', nodes, lines: [] }
  },
} as unknown as Stockfish

const pool = {
  run: async <Job>(jobs: Job[], task: (engine: Stockfish, job: Job) => Promise<unknown>) => {
    for (const job of jobs) await task(engine, job)
  },
  terminate: () => {},
}

let db: AppDatabase
let cache: EvaluationCache

const analyze = (games: ReviewGame[]) =>
  analyzeGames(games, DEFAULT_CRITERIA, {
    signal: new AbortController().signal,
    onProgress: () => {},
    cache,
  })

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
  db = new AppDatabase()
  cache = createCache(() => db)
  searches = []
  failAfter = Infinity
  vi.mocked(EnginePool.start)
    .mockReset()
    .mockResolvedValue(pool as unknown as EnginePool)
})

afterEach(() => db.close())

describe('analyzeGames with the cache', () => {
  it('keeps every evaluation, then analyses the same game again without an engine', async () => {
    const [first] = await analyze([game('g1', SCHOLAR)])
    // Every position but the final mate, then a deep look around the blunder.
    expect(searches.filter((search) => search.nodes === QUICK_NODES)).toHaveLength(7)
    expect(searches.filter((search) => search.nodes === DEEP_NODES)).toHaveLength(2)
    expect(first!.mistakes.map((mistake) => mistake.ply)).toEqual([5])
    expect(await db.positions.count()).toBe(7)
    expect(await db.games.count()).toBe(1)

    searches = []
    vi.mocked(EnginePool.start).mockClear()
    const [again] = await analyze([game('g1', SCHOLAR)])
    expect(EnginePool.start).not.toHaveBeenCalled()
    expect(again!.positions).toEqual(first!.positions)
    expect(again!.mistakes).toEqual(first!.mistakes)
  })

  it('only searches the positions not seen in other games', async () => {
    await analyze([game('g1', ['e4', 'e5', 'Nf3'])])
    searches = []
    await analyze([game('g2', ['e4', 'e5', 'Nc3'])])
    expect(searches.map((search) => search.key)).toEqual([
      positionKey(replay(['e4', 'e5', 'Nc3'])[3]!.fen),
    ])
  })

  it('reports the positions found in the cache', async () => {
    await analyze([game('g1', ['e4', 'e5'])])
    const onProgress = vi.fn<(progress: ReviewProgress) => void>()
    await analyzeGames([game('g2', ['e4', 'e5', 'Nf3'])], DEFAULT_CRITERIA, {
      signal: new AbortController().signal,
      onProgress,
      cache,
    })
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'analysing', quickTotal: 1, cached: 3 }),
    )
  })

  it('runs only the deep pass when every quick evaluation is known', async () => {
    await analyze([game('g1', SCHOLAR, 'white')])
    // As White, no error of the player: nothing was searched deeply.
    expect(searches.every((search) => search.nodes === QUICK_NODES)).toBe(true)
    searches = []
    vi.mocked(EnginePool.start).mockClear()
    await analyze([game('g1', SCHOLAR)])
    expect(EnginePool.start).toHaveBeenCalledTimes(1)
    expect(searches.map((search) => search.nodes)).toEqual([DEEP_NODES, DEEP_NODES])
  })

  it('keeps what was computed when the analysis stops', async () => {
    failAfter = 3
    await expect(analyze([game('g1', SCHOLAR)])).rejects.toThrow('Engine terminated')
    expect(await db.positions.count()).toBe(3)
    expect(await db.games.count()).toBe(0)
  })

  it('works as before when the cache fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    cache = createCache(() => {
      throw new Error('no IndexedDB')
    })
    const [reviewed] = await analyze([game('g1', SCHOLAR)])
    expect(reviewed!.mistakes.map((mistake) => mistake.ply)).toEqual([5])
    warn.mockRestore()
  })
})

describe('reviewFromCache', () => {
  it('judges the games the cache fully knows, never with an engine, and leaves out the others', async () => {
    await analyze([game('g1', SCHOLAR)])
    vi.mocked(EnginePool.start).mockClear()
    const reviewed = await reviewFromCache(
      [game('g1', SCHOLAR), game('g2', ['d4', 'd5'])],
      DEFAULT_CRITERIA,
      cache,
    )
    expect(EnginePool.start).not.toHaveBeenCalled()
    expect(reviewed.map((item) => item.id)).toEqual(['g1'])
    expect(reviewed[0]!.mistakes.map((mistake) => mistake.ply)).toEqual([5])
  })
})

describe('deepenGame with the cache', () => {
  it('keeps its evaluations: the next analysis is precise everywhere', async () => {
    const [reviewed] = await analyze([game('g1', ['e4', 'e5', 'Nf3'])])
    expect(reviewed!.positions.some((position) => !position.precise)).toBe(true)
    await deepenGame(reviewed!, {
      signal: new AbortController().signal,
      onPosition: () => {},
      cache,
    })
    searches = []
    const [again] = await analyze([game('g1', ['e4', 'e5', 'Nf3'])])
    expect(searches).toEqual([])
    expect(again!.positions.every((position) => position.precise)).toBe(true)
  })
})

describe('deepenPositions', () => {
  it('evaluates deeply every position not deep yet, once, and keeps them', async () => {
    await analyze([game('g1', ['e4', 'e5', 'Nf3']), game('g2', ['e4', 'e5', 'Nc3'])])
    const games = [game('g1', ['e4', 'e5', 'Nf3']), game('g2', ['e4', 'e5', 'Nc3'])]
    expect((await gamesToDeepen(games, cache)).size).toBe(2)
    searches = []
    const shares: number[] = []
    await deepenPositions(games, {
      signal: new AbortController().signal,
      onProgress: (share) => shares.push(share),
      cache,
    })
    // Five distinct positions: the shared opening only once.
    expect(searches).toHaveLength(5)
    expect(searches.every((search) => search.nodes === DEEP_NODES)).toBe(true)
    expect(shares.at(-1)).toBe(1)
    expect((await gamesToDeepen(games, cache)).size).toBe(0)
  })
})

describe('analysisWorkLeft', () => {
  it('counts what the cache does not already hold', async () => {
    const before = await analysisWorkLeft([game('g1', SCHOLAR)], DEFAULT_CRITERIA, cache)
    // Everything to do but the final mate: its deep pass is not known yet.
    expect(before).toEqual({ quick: [7], deep: [], fromCache: 0 })
    await analyze([game('g1', SCHOLAR)])
    expect(await analysisWorkLeft([game('g1', SCHOLAR)], DEFAULT_CRITERIA, cache)).toEqual({
      quick: [],
      deep: [],
      fromCache: 1,
    })
  })

  it('knows the deep pass left of a game evaluated quickly', async () => {
    await analyze([game('g1', SCHOLAR, 'white')])
    expect(await analysisWorkLeft([game('g1', SCHOLAR)], DEFAULT_CRITERIA, cache)).toEqual({
      quick: [],
      deep: [2],
      fromCache: 0,
    })
  })
})
