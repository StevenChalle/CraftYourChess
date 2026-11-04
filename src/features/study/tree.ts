import type { Color } from 'chessops'
import { play } from '@/features/training/moves'
import type { GamePosition } from '@/features/review/positions'

/**
 * The moves of a game being studied, as a tree: the game itself, and the variations played on it
 * from any position. Immutable: every change returns a new tree, sharing what did not change.
 */

/** A position of the tree, and the move that led to it (none for the root). */
export type StudyNode = {
  /** The moves (UCI) that lead here from the start, space-separated: '' for the root */
  id: string
  parent?: string
  /** Half-moves from the start of the game */
  ply: number
  fen: string
  turn: Color
  move?: { uci: string; san: string }
  /** Mate, stalemate or insufficient material: nothing to play nor to search */
  over: boolean
  /** Its continuations: the game's (or the variation's) first, then the variations */
  children: string[]
  /** One of the game's own positions: its index in the game is `ply` */
  inGame: boolean
}

export type StudyTree = { nodes: Record<string, StudyNode> }

export const ROOT = ''

function childId(parent: string, uci: string): string {
  return parent === ROOT ? uci : `${parent} ${uci}`
}

function node(
  id: string,
  parent: string | undefined,
  position: GamePosition,
  ply: number,
  inGame: boolean,
): StudyNode {
  return {
    id,
    ...(parent !== undefined && { parent }),
    ply,
    fen: position.fen,
    turn: position.turn,
    ...(position.move && { move: position.move }),
    over: position.finalCp !== undefined,
    children: [],
    inGame,
  }
}

/** The game's positions (replay), as a tree without variations. */
export function gameTree(positions: GamePosition[]): StudyTree {
  const nodes: Record<string, StudyNode> = {}
  let parent: StudyNode | undefined
  positions.forEach((position, ply) => {
    const id = parent ? childId(parent.id, position.move!.uci) : ROOT
    const current = node(id, parent?.id, position, ply, true)
    nodes[id] = current
    if (parent) parent.children.push(id)
    parent = current
  })
  return { nodes }
}

export function getNode(tree: StudyTree, id: string): StudyNode {
  const found = tree.nodes[id]
  if (!found) throw new Error(`No node ${id}`)
  return found
}

/**
 * Plays a legal move (UCI) from a position: the child already there when it was played before (the
 * game's move included), a new variation otherwise. Returns the tree and the node reached.
 */
export function addMove(
  tree: StudyTree,
  from: string,
  uci: string,
): { tree: StudyTree; id: string } {
  const parent = getNode(tree, from)
  const position = play(parent.fen, uci)
  // The same move in another notation (castling) is the same child.
  const id = childId(from, position.move!.uci)
  if (tree.nodes[id]) return { tree, id }
  const added = node(id, from, position, parent.ply + 1, false)
  return {
    tree: {
      nodes: {
        ...tree.nodes,
        [from]: { ...parent, children: [...parent.children, id] },
        [id]: added,
      },
    },
    id,
  }
}

/** Plays several moves in a row (an engine's line), from `from`. */
export function addLine(
  tree: StudyTree,
  from: string,
  moves: string[],
): { tree: StudyTree; id: string } {
  return moves.reduce((reached, uci) => addMove(reached.tree, reached.id, uci), { tree, id: from })
}

/**
 * Removes a variation from where it starts: `id` and everything after it. The game's own moves
 * stay. Returns the tree and where to go if the current position was in what was removed.
 */
export function deleteVariation(tree: StudyTree, id: string): { tree: StudyTree; parent: string } {
  const removed = getNode(tree, id)
  if (removed.inGame || removed.parent === undefined) return { tree, parent: id }
  const parent = getNode(tree, removed.parent)
  const nodes = { ...tree.nodes }
  const drop = (key: string) => {
    for (const child of nodes[key]!.children) drop(child)
    delete nodes[key]
  }
  drop(id)
  nodes[parent.id] = { ...parent, children: parent.children.filter((child) => child !== id) }
  return { tree: { nodes }, parent: parent.id }
}

/** From the start to `id`, both included. */
export function pathTo(tree: StudyTree, id: string): StudyNode[] {
  const path: StudyNode[] = []
  let current: StudyNode | undefined = getNode(tree, id)
  while (current) {
    path.unshift(current)
    current = current.parent === undefined ? undefined : tree.nodes[current.parent]
  }
  return path
}

/** Whether `id` is `ancestor` or comes after it. */
export function isWithin(id: string, ancestor: string): boolean {
  return ancestor === ROOT || id === ancestor || id.startsWith(`${ancestor} `)
}

/**
 * Where the arrow keys lead from `id`. Forward follows the line being looked at: the first
 * continuation, or the one of `line` (the furthest position reached in it) when it goes through
 * `id`. The end of the line is that furthest position followed to its end.
 */
export function step(
  tree: StudyTree,
  id: string,
  direction: 'back' | 'forward' | 'start' | 'end',
  line: string = id,
): string {
  const current = getNode(tree, id)
  if (direction === 'start') return ROOT
  if (direction === 'back') return current.parent ?? id
  const followed = isWithin(line, id) && line !== id ? line : id
  if (direction === 'forward') {
    if (followed !== id)
      return followed
        .split(' ')
        .slice(0, current.ply + 1)
        .join(' ')
    return current.children[0] ?? id
  }
  let end = getNode(tree, followed)
  while (end.children[0]) end = getNode(tree, end.children[0])
  return end.id
}

/** The game's own last position. */
export function gameEnd(tree: StudyTree): string {
  let end = getNode(tree, ROOT)
  while (end.children[0] && tree.nodes[end.children[0]]!.inGame)
    end = getNode(tree, end.children[0])
  return end.id
}

/** The game's position `ply` half-moves in (the last one if the game is shorter). */
export function gameNodeAt(tree: StudyTree, ply: number): string {
  let current = getNode(tree, ROOT)
  while (current.ply < ply) {
    const next = current.children[0]
    if (!next || !tree.nodes[next]!.inGame) break
    current = getNode(tree, next)
  }
  return current.id
}

/** The move that led to `node`: its number and who played it ("12." for White, "12…" for Black). */
export function moveNumber(node: Pick<StudyNode, 'fen' | 'turn'>): {
  number: number
  white: boolean
} {
  // The FEN's move counter goes up once Black has played.
  const counter = Number(node.fen.split(' ')[5] ?? 1)
  const white = node.turn === 'black'
  return { number: white ? counter : counter - 1, white }
}
