import { describe, expect, it } from 'vitest'
import { replay } from '@/features/review/positions'
import {
  addLine,
  addMove,
  deleteVariation,
  gameEnd,
  gameNodeAt,
  gameTree,
  getNode,
  moveNumber,
  pathTo,
  ROOT,
  step,
} from './tree'

const game = () => gameTree(replay(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']))

describe('the study tree', () => {
  it('holds the game as its main line', () => {
    const tree = game()
    expect(Object.keys(tree.nodes)).toHaveLength(6)
    const end = gameEnd(tree)
    expect(end).toBe('e2e4 e7e5 g1f3 b8c6 f1b5')
    expect(getNode(tree, end)).toMatchObject({ ply: 5, inGame: true, move: { san: 'Bb5' } })
    expect(pathTo(tree, end).map((node) => node.move?.san)).toEqual([
      undefined,
      'e4',
      'e5',
      'Nf3',
      'Nc6',
      'Bb5',
    ])
    expect(gameNodeAt(tree, 2)).toBe('e2e4 e7e5')
    expect(gameNodeAt(tree, 99)).toBe(end)
  })

  it('reuses a move already there, and adds a variation otherwise', () => {
    const tree = game()
    expect(addMove(tree, 'e2e4', 'e7e5')).toEqual({ tree, id: 'e2e4 e7e5' })
    const { tree: next, id } = addMove(tree, 'e2e4', 'c7c5')
    expect(id).toBe('e2e4 c7c5')
    expect(getNode(next, 'e2e4').children).toEqual(['e2e4 e7e5', 'e2e4 c7c5'])
    expect(getNode(next, id)).toMatchObject({ ply: 2, inGame: false, move: { san: 'c5' } })
    // The tree it came from is untouched.
    expect(getNode(tree, 'e2e4').children).toEqual(['e2e4 e7e5'])
  })

  it('knows castling however it is written', () => {
    const tree = gameTree(replay(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']))
    const from = 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5'
    expect(addMove(tree, from, 'e1h1').id).toBe(`${from} e1g1`)
    expect(addMove(tree, from, 'e1g1').id).toBe(`${from} e1g1`)
  })

  it('plays an engine line in one go, and spots the end of the game', () => {
    const { tree, id } = addLine(gameTree(replay(['f3', 'e5', 'g4'])), 'f2f3 e7e5 g2g4', ['d8h4'])
    expect(getNode(tree, id)).toMatchObject({ over: true, move: { san: 'Qh4#' } })
  })

  it('removes a variation and what follows, never the game', () => {
    let tree = addLine(game(), 'e2e4', ['c7c5', 'g1f3', 'd7d6']).tree
    tree = addMove(tree, 'e2e4 c7c5', 'b1c3').tree
    const { tree: pruned, parent } = deleteVariation(tree, 'e2e4 c7c5')
    expect(parent).toBe('e2e4')
    expect(Object.keys(pruned.nodes)).toHaveLength(6)
    expect(getNode(pruned, 'e2e4').children).toEqual(['e2e4 e7e5'])
    expect(deleteVariation(pruned, 'e2e4 e7e5').tree).toBe(pruned)
  })

  it('moves along the line being looked at', () => {
    const { tree } = addLine(game(), 'e2e4', ['c7c5', 'g1f3', 'd7d6'])
    // From the start, forward follows the game…
    expect(step(tree, ROOT, 'forward')).toBe('e2e4')
    expect(step(tree, 'e2e4', 'forward')).toBe('e2e4 e7e5')
    // …or the variation last reached, once back in the game.
    const line = 'e2e4 c7c5 g1f3 d7d6'
    expect(step(tree, 'e2e4', 'forward', line)).toBe('e2e4 c7c5')
    expect(step(tree, ROOT, 'end', line)).toBe(line)
    expect(step(tree, 'e2e4 c7c5', 'back')).toBe('e2e4')
    expect(step(tree, 'e2e4 c7c5', 'start')).toBe(ROOT)
    expect(step(tree, line, 'forward')).toBe(line)
    expect(step(tree, ROOT, 'back')).toBe(ROOT)
    expect(step(tree, 'e2e4 c7c5', 'end')).toBe(line)
  })

  it('numbers moves as in a score sheet, from a set-up position too', () => {
    const tree = game()
    expect(moveNumber(getNode(tree, 'e2e4'))).toEqual({ number: 1, white: true })
    expect(moveNumber(getNode(tree, 'e2e4 e7e5'))).toEqual({ number: 1, white: false })
    expect(moveNumber(getNode(tree, gameEnd(tree)))).toEqual({ number: 3, white: true })
    const setUp = gameTree(replay(['Kd7'], '4k3/8/8/8/8/8/8/4K3 b - - 0 40'))
    expect(moveNumber(getNode(setUp, 'e8d7'))).toEqual({ number: 40, white: false })
  })
})
