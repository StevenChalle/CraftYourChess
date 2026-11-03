import type { Color } from 'chessops'
import { trackActiveTime } from '@/lib/activeTime'
import { defaultPoolSize, EnginePool } from '@/lib/engine/pool'
import type { Stockfish } from '@/lib/engine/stockfish'
import { ENGINE_ID } from '@/lib/engine/stockfish'
import type { ApiSource } from '@/lib/http'
import {
  analysisCache,
  cacheWriter,
  movesHash,
  positionKey,
  type AnalysisRecipe,
  type CacheEntry,
  type EvaluationCache,
} from './cache'
import { deepCheckMinDrop, type ReviewCriteria } from './criteria'
import { fromSideToMove, isError, playerMoves, toCp, winChanceDrop } from './errors'
import { clockBefore, type ReviewGame } from './games'
import { replay, type GamePosition } from './positions'
import { remainingSeconds, type AnalysisPass, type ReviewProgress } from './progress'

/**
 * Two passes: a quick search on every position, then a deeper one only around the player's
 * suspicious moves. Budgets are in nodes, not time, so results do not depend on the device.
 */
export const QUICK_NODES = 100_000
export const DEEP_NODES = 1_000_000

/**
 * Changes with the way games are analysed (budgets, positions of the deep pass…): kept with each
 * game in the analysis cache, to offer updating old analyses one day.
 */
export const ANALYSIS_VERSION = 1

export const RECIPE: AnalysisRecipe = {
  version: ANALYSIS_VERSION,
  engine: ENGINE_ID,
  quickNodes: QUICK_NODES,
  deepNodes: DEEP_NODES,
}

/** One error of the reviewed player (see errors.ts), with what is needed to replay it. */
export type Mistake = {
  /** Unique across games: `${source}-${gameId}-${ply}` */
  id: string
  /** Half-move number of the position before the error, in the game: its order among the others */
  ply: number
  /** With its moves: the whole game on Lichess (lichessGameUrl) */
  game: Pick<
    ReviewGame,
    'source' | 'id' | 'url' | 'playedAt' | 'opponent' | 'sanMoves' | 'initialFen'
  >
  color: Color
  /** Position before the error */
  fen: string
  /** The opponent's move that led to it (UCI), to highlight on the board */
  lastMove?: string
  played: { uci: string; san: string }
  /** From the player's side */
  beforeCp: number
  afterCp: number
  /** The player's clock before the error and the expected length of the game (seconds) */
  clock?: { remaining: number; total: number }
}

/** A position of an analysed game, with its evaluation (White's side, centipawns). */
export type AnalysedPosition = GamePosition & {
  cp: number
  /**
   * Worth trusting: a deep search, Lichess's own analysis or a finished game. The others only had
   * a quick look and can be deepened (deepenGame).
   */
  precise: boolean
}

export type ReviewedGame = ReviewGame & {
  mistakes: Mistake[]
  /** Every position, from the start: the evaluation curve */
  positions: AnalysedPosition[]
  /** The opponent's errors, by the same rules: index of the position before each one */
  opponentErrors: number[]
}

export type ReviewOutcome = {
  /** Newest first */
  games: ReviewedGame[]
  /** Platforms whose games could not be fetched: the others are still reviewed. */
  failures: { source: ApiSource; error: Error }[]
  /** The rules the games were judged with */
  criteria: ReviewCriteria
}

/** A game being analysed: its positions and their evaluations (White's side, centipawns). */
type Work = {
  game: ReviewGame
  positions: GamePosition[]
  cps: (number | undefined)[]
  /** Positions the engine evaluated (as opposed to final positions or Lichess evaluations) */
  byEngine: Set<number>
  /** Of those, the ones evaluated deeply */
  deep: Set<number>
}

/** Positions of one game to evaluate in a pass. */
type Job = { work: Work; indexes: number[] }

function prepare(game: ReviewGame): Work {
  const positions = replay(game.sanMoves, game.initialFen)
  const cps = positions.map(
    // Lichess evaluations are those of the position after each move: shifted by one.
    (position, index) => position.finalCp ?? (index > 0 ? game.serverCps?.[index - 1] : undefined),
  )
  return { game, positions, cps, byEngine: new Set(), deep: new Set() }
}

/** Positions still without an evaluation. A game without moves needs none. */
function missing(work: Work): number[] {
  if (work.positions.length < 2) return []
  return work.cps.flatMap((cp, index) => (cp === undefined ? [index] : []))
}

/**
 * Fills the missing evaluations the cache knows (at least a quick search), and returns how many.
 * Those from a deep search count as deep: the deep pass skips them.
 */
async function fillFromCache(works: Work[], cache: EvaluationCache): Promise<number> {
  const wanted = works.map((work) => ({ work, indexes: missing(work) }))
  const found = await cache.lookup(
    wanted.flatMap(({ work, indexes }) =>
      indexes.map((index) => positionKey(work.positions[index]!.fen)),
    ),
  )
  let count = 0
  for (const { work, indexes } of wanted) {
    for (const index of indexes) {
      const position = work.positions[index]!
      const cached = found.get(positionKey(position.fen))
      if (!cached || cached.nodes < QUICK_NODES) continue
      work.cps[index] = toCp(fromSideToMove(cached.score, position.turn))
      work.byEngine.add(index)
      if (cached.nodes >= DEEP_NODES) work.deep.add(index)
      count++
    }
  }
  return count
}

/** Positions evaluated by the engine but not deeply yet. */
function shallow(work: Work): boolean {
  return [...work.byEngine].some((index) => !work.deep.has(index))
}

/** Engine-evaluated positions around the player's moves that look like errors. */
function deepCheckPositions(work: Work, criteria: ReviewCriteria): number[] {
  const turns = work.positions.map((position) => position.turn)
  const indexes = new Set<number>()
  const minDrop = deepCheckMinDrop(criteria)
  for (const move of playerMoves(work.cps as number[], turns, work.game.color)) {
    if (winChanceDrop(move.beforeCp, move.afterCp) < minDrop) continue
    for (const index of [move.ply, move.ply + 1]) {
      if (work.byEngine.has(index) && !work.deep.has(index)) indexes.add(index)
    }
  }
  return [...indexes].toSorted((a, b) => a - b)
}

function finish(works: Work[], criteria: ReviewCriteria): ReviewedGame[] {
  return works.map(({ game, positions, cps, byEngine, deep }) =>
    judge(
      game,
      positions.map((position, index) => ({
        ...position,
        cp: cps[index] ?? 0,
        precise: !byEngine.has(index) || deep.has(index),
      })),
      criteria,
    ),
  )
}

/** The errors of both players in a game whose positions are evaluated. */
export function judge(
  game: ReviewGame,
  positions: AnalysedPosition[],
  criteria: ReviewCriteria,
): ReviewedGame {
  const cps = positions.map((position) => position.cp)
  const turns = positions.map((position) => position.turn)
  const errors = (color: Color) =>
    playerMoves(cps, turns, color).filter((move) =>
      isError(move.beforeCp, move.afterCp, criteria.errorMinDrop),
    )
  const mistakes = errors(game.color).map(({ ply, beforeCp, afterCp }) => ({
    id: `${game.source}-${game.id}-${ply}`,
    ply,
    game: {
      source: game.source,
      id: game.id,
      url: game.url,
      playedAt: game.playedAt,
      opponent: game.opponent,
      sanMoves: game.sanMoves,
      ...(game.initialFen && { initialFen: game.initialFen }),
    },
    color: game.color,
    fen: positions[ply]!.fen,
    lastMove: positions[ply]!.move?.uci,
    played: positions[ply + 1]!.move!,
    beforeCp,
    afterCp,
    clock: mistakeClock(game, ply),
  }))
  const opponent = game.color === 'white' ? 'black' : 'white'
  return {
    ...game,
    mistakes,
    positions,
    opponentErrors: errors(opponent).map((move) => move.ply),
  }
}

function mistakeClock(game: ReviewGame, ply: number): Mistake['clock'] {
  const remaining = game.clock && clockBefore(game.clock, ply)
  return remaining === undefined ? undefined : { remaining, total: game.clock!.total }
}

/** White's-side centipawns, and the evaluation as the cache keeps it. */
async function evaluate(
  engine: Stockfish,
  position: GamePosition,
  nodes: number,
): Promise<{ cp: number; entry: CacheEntry }> {
  const { score, bestMove } = await engine.evaluate(position.fen, nodes)
  return {
    cp: toCp(fromSideToMove(score, position.turn)),
    entry: { key: positionKey(position.fen), score, bestMove, nodes },
  }
}

/**
 * Fills the missing evaluations of `games` from the cache, then with Stockfish, and finds the
 * player's errors in each one, judged with `criteria` (see errors.ts). Every evaluation made is
 * kept in the cache, even if the analysis is aborted. Aborting the signal terminates the engines.
 */
export async function analyzeGames(
  games: ReviewGame[],
  criteria: ReviewCriteria,
  {
    signal,
    onProgress,
    poolSize = defaultPoolSize(),
    cache = analysisCache,
  }: {
    signal: AbortSignal
    onProgress: (progress: ReviewProgress) => void
    poolSize?: number
    cache?: EvaluationCache
  },
): Promise<ReviewedGame[]> {
  const works = games.map(prepare)
  const cached = await fillFromCache(works, cache)
  signal.throwIfAborted()
  const quick = works
    .map((work) => ({ work, indexes: missing(work) }))
    .filter((job) => job.indexes.length > 0)
  const deepJobs = () =>
    works
      .map((work) => ({ work, indexes: deepCheckPositions(work, criteria) }))
      .filter((job) => job.indexes.length > 0)
  // Every quick evaluation in the cache: the deep pass is known right away.
  const deepOnly = quick.length === 0 ? deepJobs() : []
  if (quick.length === 0 && deepOnly.length === 0) {
    await cache.saveGames(games, RECIPE)
    return finish(works, criteria)
  }

  onProgress({ phase: 'starting-engine', games: games.length })
  const busy = works.filter((work) => missing(work).length > 0 || shallow(work)).length
  const pool = await EnginePool.start(Math.min(poolSize, busy), signal)
  const writer = cacheWriter(cache)
  // The speed is measured over the whole analysis, so the deep pass gets a time estimate right
  // away from the quick pass; only while the page is shown (a phone freezes a hidden page).
  const active = trackActiveTime()
  try {
    let doneNodes = 0
    const quickTotal = quick.reduce((sum, job) => sum + job.indexes.length, 0)

    const runPass = async (pass: AnalysisPass, jobs: Job[], nodes: number) => {
      const total = jobs.reduce((sum, job) => sum + job.indexes.length, 0)
      let done = 0
      const report = () =>
        onProgress({
          phase: 'analysing',
          games: games.length,
          quickTotal,
          cached,
          pass,
          done,
          total,
          remainingSeconds: remainingSeconds({
            doneNodes,
            elapsedMs: active.time.elapsedMs(),
            remainingNodes: (total - done) * nodes,
          }),
        })
      report()
      await pool.run(jobs, async (engine, { work, indexes }) => {
        if (pass === 'quick') await engine.newGame()
        for (const index of indexes) {
          const { cp, entry } = await evaluate(engine, work.positions[index]!, nodes)
          work.cps[index] = cp
          writer.add(entry)
          work.byEngine.add(index)
          if (pass === 'deep') work.deep.add(index)
          done++
          doneNodes += nodes
          active.time.markProgress()
          report()
        }
      })
    }

    if (quick.length > 0) await runPass('quick', quick, QUICK_NODES)
    const deep = quick.length > 0 ? deepJobs() : deepOnly
    if (deep.length > 0) await runPass('deep', deep, DEEP_NODES)
  } finally {
    active.stop()
    pool.terminate()
    await writer.flush()
  }

  await cache.saveGames(games, RECIPE)
  return finish(works, criteria)
}

/**
 * The games whose every position the cache evaluates, judged with `criteria`, without Stockfish:
 * the others are left out. For a look at the errors of games analysed before (the profile).
 */
export async function reviewFromCache(
  games: ReviewGame[],
  criteria: ReviewCriteria,
  cache: EvaluationCache = analysisCache,
): Promise<ReviewedGame[]> {
  const works = games.map(prepare)
  await fillFromCache(works, cache)
  return finish(
    works.filter((work) => work.positions.length > 1 && missing(work).length === 0),
    criteria,
  )
}

/** What an analysis of some games would still have to compute, the cache taken into account. */
export type WorkLeft = {
  /** Per game with positions not evaluated yet: how many (their deep pass is not known yet) */
  quick: number[]
  /** Per game fully evaluated but for the deep pass around its suspicious moves: how many */
  deep: number[]
  /** Games with nothing left thanks to the cache; those Lichess analysed are counted apart (recap) */
  fromCache: number
}

/** The work left to analyse `games` with `criteria`, for the estimate before launching. */
export async function analysisWorkLeft(
  games: ReviewGame[],
  criteria: ReviewCriteria,
  cache: EvaluationCache = analysisCache,
): Promise<WorkLeft> {
  const works = games.map(prepare)
  const before = works.map((work) => missing(work).length)
  await fillFromCache(works, cache)
  const left: WorkLeft = { quick: [], deep: [], fromCache: 0 }
  works.forEach((work, index) => {
    const positions = missing(work).length
    if (positions > 0) {
      left.quick.push(positions)
      return
    }
    const deep = deepCheckPositions(work, criteria).length
    if (deep > 0) left.deep.push(deep)
    else if (before[index]! > 0 && !work.game.serverCps) left.fromCache++
  })
  return left
}

/**
 * The games (movesHash) with positions the engine only looked at quickly, or not at all: those
 * deepenPositions would work on.
 */
export async function gamesToDeepen(
  games: ReviewGame[],
  cache: EvaluationCache = analysisCache,
): Promise<Set<string>> {
  const works = games.map(prepare)
  await fillFromCache(works, cache)
  return new Set(
    works
      .filter((work) => missing(work).length > 0 || shallow(work))
      .map((work) => movesHash(work.game.sanMoves, work.game.initialFen)),
  )
}

/**
 * Evaluates deeply every position of `games` the engine only looked at quickly (or not at all),
 * each position once even if several games share it, and keeps the results in the cache: the
 * background analysis's deep option. `onProgress`: the share done, 0 to 1. Aborting the signal
 * stops the engines; what is evaluated stays.
 */
export async function deepenPositions(
  games: ReviewGame[],
  {
    signal,
    onProgress,
    poolSize = defaultPoolSize(),
    cache = analysisCache,
  }: {
    signal: AbortSignal
    onProgress: (share: number) => void
    poolSize?: number
    cache?: EvaluationCache
  },
): Promise<void> {
  const works = games.map(prepare)
  await fillFromCache(works, cache)
  signal.throwIfAborted()
  const positions = new Map<string, GamePosition>()
  for (const work of works) {
    const shallowIndexes = [...work.byEngine].filter((index) => !work.deep.has(index))
    for (const index of [...missing(work), ...shallowIndexes]) {
      const position = work.positions[index]!
      positions.set(positionKey(position.fen), position)
    }
  }
  if (positions.size === 0) return
  const pool = await EnginePool.start(Math.min(poolSize, positions.size), signal)
  const writer = cacheWriter(cache)
  let done = 0
  try {
    await pool.run([...positions.values()], async (engine, position) => {
      const { entry } = await evaluate(engine, position, DEEP_NODES)
      writer.add(entry)
      done++
      onProgress(done / positions.size)
    })
  } finally {
    pool.terminate()
    await writer.flush()
  }
}

/** Positions of a game that only had a quick look. */
export function shallowPositions(game: ReviewedGame): number[] {
  return game.positions.flatMap((position, index) => (position.precise ? [] : [index]))
}

/**
 * Evaluates deeply every position of `game` that only had a quick look, several at a time, and
 * reports each new evaluation as it comes (`onPosition`), keeping it in the cache. Aborting the
 * signal stops the engines: what was reported stays.
 */
export async function deepenGame(
  game: ReviewedGame,
  {
    signal,
    onPosition,
    poolSize = defaultPoolSize(),
    cache = analysisCache,
  }: {
    signal: AbortSignal
    onPosition: (index: number, cp: number) => void
    poolSize?: number
    cache?: EvaluationCache
  },
): Promise<void> {
  const indexes = shallowPositions(game)
  if (indexes.length === 0) return
  const pool = await EnginePool.start(Math.min(poolSize, indexes.length), signal)
  const writer = cacheWriter(cache)
  try {
    await pool.run(indexes, async (engine, index) => {
      const { cp, entry } = await evaluate(engine, game.positions[index]!, DEEP_NODES)
      writer.add(entry)
      if (!signal.aborted) onPosition(index, cp)
    })
  } finally {
    pool.terminate()
    await writer.flush()
  }
}

/** The game with one position deepened, its errors judged again. */
export function withDeepPosition(
  game: ReviewedGame,
  index: number,
  cp: number,
  criteria: ReviewCriteria,
): ReviewedGame {
  const positions = game.positions.map((position, i) =>
    i === index ? { ...position, cp, precise: true } : position,
  )
  return judge(game, positions, criteria)
}
