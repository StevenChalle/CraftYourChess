import type { ReviewedGame } from '@/features/review/analyze'
import { moveTime, type ReviewGame } from '@/features/review/games'
import { replay } from '@/features/review/positions'
import {
  addLine,
  addMove,
  deleteVariation,
  gameNodeAt,
  gameTree,
  getNode,
  isWithin,
  step,
  type StudyTree,
} from './tree'

/**
 * Where a study stands: the tree of moves, the position on screen, and the line being looked at
 * (the furthest position reached along it), which the arrow keys follow forward.
 */
export type StudyState = { tree: StudyTree; current: string; line: string }

export type StudyAction =
  | { type: 'goto'; id: string }
  | { type: 'step'; direction: 'back' | 'forward' | 'start' | 'end' }
  | { type: 'play'; uci: string }
  | { type: 'playLine'; moves: string[] }
  | { type: 'delete'; id: string }

export function startStudy(
  game: Pick<ReviewGame, 'sanMoves' | 'initialFen'>,
  ply: number,
): StudyState {
  const tree = gameTree(replay(game.sanMoves, game.initialFen))
  const current = gameNodeAt(tree, ply)
  return { tree, current, line: current }
}

/** The line once at `id`: kept when `id` is on it, `id` otherwise. */
function lineAt(state: StudyState, id: string): string {
  return isWithin(state.line, id) ? state.line : id
}

export function studyReducer(state: StudyState, action: StudyAction): StudyState {
  switch (action.type) {
    case 'goto':
      if (!state.tree.nodes[action.id]) return state
      return { ...state, current: action.id, line: lineAt(state, action.id) }
    case 'step': {
      const id = step(state.tree, state.current, action.direction, state.line)
      return { ...state, current: id, line: lineAt(state, id) }
    }
    case 'play':
    case 'playLine': {
      if (getNode(state.tree, state.current).over) return state
      try {
        const { tree, id } =
          action.type === 'play'
            ? addMove(state.tree, state.current, action.uci)
            : addLine(state.tree, state.current, action.moves)
        return { tree, current: id, line: lineAt({ ...state, tree }, id) }
      } catch {
        // A move the position does not allow (a board out of step with it): nothing happens.
        return state
      }
    }
    case 'delete': {
      const { tree, parent } = deleteVariation(state.tree, action.id)
      if (tree === state.tree) return state
      const current = isWithin(state.current, action.id) ? parent : state.current
      const line = isWithin(state.line, action.id) ? current : state.line
      return { tree, current, line }
    }
  }
}

/** Where the variation holding `id` starts: its first move off the game. undefined in the game. */
export function variationStart(tree: StudyTree, id: string): string | undefined {
  let node = getNode(tree, id)
  if (node.inGame) return undefined
  while (node.parent !== undefined && !getNode(tree, node.parent).inGame) {
    node = getNode(tree, node.parent)
  }
  return node.id
}

/** The game's last position on the way to `id`: where a variation leaves it. */
export function gamePly(tree: StudyTree, id: string): number {
  const start = variationStart(tree, id)
  const node = getNode(tree, start === undefined ? id : getNode(tree, start).parent!)
  return node.ply
}

/** What the analysis says of each of the game's positions, by ply. */
export type MoveNote = {
  /** White's side, centipawns */
  cp?: number
  /** The player's error led here */
  mine?: boolean
  /** The opponent's error led here */
  theirs?: boolean
  /** Seconds spent on the move that led here */
  spent?: number
}

export function moveNotes(game: ReviewGame, review: ReviewedGame | undefined): MoveNote[] {
  const count = review?.positions.length ?? game.sanMoves.length + 1
  const mine = new Set(review?.mistakes.map((mistake) => mistake.ply + 1))
  const theirs = new Set(review?.opponentErrors.map((ply) => ply + 1))
  return Array.from({ length: count }, (_, ply) => {
    const time =
      ply > 0 && game.clock ? moveTime(game.clock, ply - 1, game.source !== 'lichess') : undefined
    return {
      ...(review && { cp: review.positions[ply]?.cp }),
      ...(mine.has(ply) && { mine: true }),
      ...(theirs.has(ply) && { theirs: true }),
      ...(time?.spent !== undefined && { spent: time.spent }),
    }
  })
}
