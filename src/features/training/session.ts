import type { Mistake } from '@/features/review/analyze'
import { forColor } from '@/features/review/errors'
import { isAccepted, type Assessment } from './assessment'
import type { ScoredMove } from './coach'
import { sameMove } from './moves'
import type { Exercise } from './settings'

/**
 * Replaying one's errors, one position at a time:
 *   thinking → (move) checking → solved | wrong
 *   wrong → (retry) thinking | (show solution) revealed
 *   solved | revealed → (next) next position, or the summary after the last one
 *   solved | revealed → (explore) thinking: try another move to see what it gives.
 * The position's result is settled by the first solve or reveal; exploring never changes it.
 * With the "evaluate" exercise, each position starts with saying how it stands:
 *   evaluating → (assess) evaluated → (next) thinking, or the next position without "replay".
 */
export type PuzzleStatus =
  'evaluating' | 'evaluated' | 'thinking' | 'checking' | 'wrong' | 'solved' | 'revealed'

export type PuzzleResult = 'first-try' | 'after-retries' | 'revealed'

export type TrainingState = {
  /** Shuffled */
  puzzles: Mistake[]
  /** Say how each position stands first */
  evaluate: boolean
  /** Find a valid move (after the evaluation, if any) */
  replay: boolean
  index: number
  status: PuzzleStatus | 'summary'
  /** Moves tried on the current position */
  attempts: number
  /** The last move tried (UCI), shown on the board until the next retry */
  tried?: string
  /** Evaluation after the tried move (centipawns, player's side), once checked */
  triedCp?: number
  /** The engine's expected reply to the tried move (UCI), once checked */
  triedReply?: string
  /** Engine's best move for the current position (UCI) and its evaluation, once known */
  best?: string
  bestCp?: number
  /** Valid moves known so far, best first: the engine's top lines, plus any found beyond them */
  validMoves?: ScoredMove[]
  /** Every top line was valid: there may be more valid moves than listed */
  validCapped?: boolean
  /** Result of the current position, once solved or revealed */
  outcome?: PuzzleResult
  results: PuzzleResult[]
  /** The player's word for the current position, once given */
  assessment?: Assessment
  /** Whether each position done was well evaluated (with the "evaluate" exercise) */
  assessments: boolean[]
}

export type TrainingAction =
  | { type: 'assess'; answer: Assessment }
  | { type: 'try'; uci: string }
  | { type: 'verdict'; puzzleId: string; valid: boolean; afterCp: number; reply?: string }
  | {
      type: 'best'
      puzzleId: string
      uci: string
      cp: number
      validMoves: ScoredMove[]
      validCapped: boolean
    }
  | { type: 'retry' }
  | { type: 'reveal' }
  | { type: 'explore' }
  | { type: 'next' }

/** Fisher-Yates, with an injectable random source for tests. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled
}

/** A training on these positions, in this order (see trainingPuzzles, order.ts). */
export function startTraining(
  puzzles: Mistake[],
  exercises: Exercise[] = ['replay'],
): TrainingState {
  const evaluate = exercises.includes('evaluate')
  return {
    puzzles,
    evaluate,
    replay: !evaluate || exercises.includes('replay'),
    index: 0,
    status: puzzles.length === 0 ? 'summary' : evaluate ? 'evaluating' : 'thinking',
    attempts: 0,
    results: [],
    assessments: [],
  }
}

/** How far a training went: what a reload of the page brings back. */
export type TrainingProgress = Pick<TrainingState, 'index' | 'results' | 'assessments'>

/**
 * A training taken up again where it was (a reload of the page): the positions done keep their
 * results, the current one starts over, as when first shown.
 */
export function resumeTraining(
  puzzles: Mistake[],
  exercises: Exercise[] | undefined,
  progress: TrainingProgress,
): TrainingState {
  const fresh = startTraining(puzzles, exercises)
  if (fresh.status === 'summary') return fresh
  const index = Math.min(Math.max(progress.index, 0), puzzles.length)
  return {
    ...fresh,
    index,
    status: index >= puzzles.length ? 'summary' : fresh.status,
    results: progress.results.slice(0, index),
    assessments: progress.assessments.slice(0, index),
  }
}

/**
 * The player's evaluation judged against the engine's (known once the best move is): undefined
 * until both are there.
 */
export function assessmentVerdict(state: TrainingState): boolean | undefined {
  const puzzle = currentPuzzle(state)
  if (!puzzle || !state.assessment || state.bestCp === undefined) return undefined
  return isAccepted(state.assessment, forColor(state.bestCp, puzzle.color))
}

export function currentPuzzle(state: TrainingState): Mistake | undefined {
  return state.status === 'summary' ? undefined : state.puzzles[state.index]
}

export function trainingReducer(state: TrainingState, action: TrainingAction): TrainingState {
  const puzzle = currentPuzzle(state)
  if (!puzzle) return state
  switch (action.type) {
    case 'assess':
      if (state.status !== 'evaluating') return state
      return { ...state, status: 'evaluated', assessment: action.answer }
    case 'try':
      if (state.status !== 'thinking') return state
      return { ...state, status: 'checking', attempts: state.attempts + 1, tried: action.uci }
    case 'verdict':
      // A late answer about a position already left is ignored.
      if (state.status !== 'checking' || action.puzzleId !== puzzle.id) return state
      return {
        ...state,
        status: action.valid ? 'solved' : 'wrong',
        triedCp: action.afterCp,
        triedReply: action.reply,
        validMoves: action.valid
          ? withMove(state.validMoves, puzzle.fen, { uci: state.tried!, cp: action.afterCp })
          : state.validMoves,
        outcome:
          state.outcome ??
          (action.valid ? (state.attempts === 1 ? 'first-try' : 'after-retries') : undefined),
      }
    case 'best':
      if (action.puzzleId !== puzzle.id) return state
      return {
        ...state,
        best: action.uci,
        bestCp: action.cp,
        validMoves: mergeMoves(action.validMoves, state.validMoves, puzzle.fen),
        validCapped: action.validCapped,
      }
    case 'retry':
      if (state.status !== 'wrong') return state
      return {
        ...state,
        status: 'thinking',
        tried: undefined,
        triedCp: undefined,
        triedReply: undefined,
      }
    case 'reveal':
      if (state.status !== 'wrong' || !state.best) return state
      return {
        ...state,
        status: 'revealed',
        tried: undefined,
        triedCp: undefined,
        triedReply: undefined,
        outcome: state.outcome ?? 'revealed',
      }
    case 'explore':
      if (state.status !== 'solved' && state.status !== 'revealed') return state
      return {
        ...state,
        status: 'thinking',
        tried: undefined,
        triedCp: undefined,
        triedReply: undefined,
      }
    case 'next': {
      if (state.status === 'evaluated') {
        // Judged once the engine's evaluation is known.
        const verdict = assessmentVerdict(state)
        if (verdict === undefined) return state
        // Part 2: the same position, to find a valid move.
        if (state.replay) return { ...state, status: 'thinking' }
        return advance(state, [...state.assessments, verdict])
      }
      // Once settled, the player may move on from any state, even while exploring.
      if (!state.outcome) return state
      const verdict = assessmentVerdict(state)
      return advance(
        { ...state, results: [...state.results, state.outcome] },
        verdict === undefined ? state.assessments : [...state.assessments, verdict],
      )
    }
  }
}

/** On to the next position (or the summary), with the results of this one recorded. */
function advance(state: TrainingState, assessments: boolean[]): TrainingState {
  const index = state.index + 1
  return {
    ...state,
    index,
    status: index >= state.puzzles.length ? 'summary' : state.evaluate ? 'evaluating' : 'thinking',
    attempts: 0,
    tried: undefined,
    triedCp: undefined,
    triedReply: undefined,
    best: undefined,
    bestCp: undefined,
    validMoves: undefined,
    validCapped: undefined,
    outcome: undefined,
    assessment: undefined,
    assessments,
  }
}

/** Adds a move found valid, unless already listed; the list stays sorted best first. */
function withMove(moves: ScoredMove[] | undefined, fen: string, move: ScoredMove): ScoredMove[] {
  const list = moves ?? []
  if (list.some((known) => sameMove(fen, known.uci, move.uci))) return list
  return [...list, move].toSorted((a, b) => b.cp - a.cp)
}

/** The engine's valid moves, plus any the player already found beyond them. */
function mergeMoves(engine: ScoredMove[], found: ScoredMove[] | undefined, fen: string) {
  return (found ?? []).reduce((list, move) => withMove(list, fen, move), engine)
}

/**
 * The positions whose move was not found at first (found after retries, or solution shown), in
 * the order played. Evaluations play no part.
 */
export function missedPuzzles(state: Pick<TrainingState, 'puzzles' | 'results'>): Mistake[] {
  return state.puzzles.filter((_, index) => {
    const result = state.results[index]
    return result !== undefined && result !== 'first-try'
  })
}

export function summarize(results: PuzzleResult[]): Record<PuzzleResult, number> {
  const totals: Record<PuzzleResult, number> = { 'first-try': 0, 'after-retries': 0, revealed: 0 }
  for (const result of results) totals[result]++
  return totals
}
