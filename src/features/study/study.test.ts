import { describe, expect, it } from 'vitest'
import type { ReviewedGame } from '@/features/review/analyze'
import type { ReviewGame } from '@/features/review/games'
import { gamePly, moveNotes, startStudy, studyReducer, variationStart } from './study'

const game = {
  source: 'chesscom',
  sanMoves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
  clock: { initial: 180, increment: 0, total: 180, remaining: [179, 178, 170, 175, 160] },
} as unknown as ReviewGame

describe('a study', () => {
  it('starts at the asked move of the game', () => {
    const state = startStudy(game, 2)
    expect(state.current).toBe('e2e4 e7e5')
    expect(startStudy(game, 0).current).toBe('')
  })

  it('plays variations, comes back to the game, and goes forward along the last line', () => {
    let state = startStudy(game, 2)
    state = studyReducer(state, { type: 'play', uci: 'b1c3' })
    state = studyReducer(state, { type: 'play', uci: 'g8f6' })
    expect(state.current).toBe('e2e4 e7e5 b1c3 g8f6')
    expect(variationStart(state.tree, state.current)).toBe('e2e4 e7e5 b1c3')
    expect(gamePly(state.tree, state.current)).toBe(2)
    state = studyReducer(state, { type: 'step', direction: 'back' })
    state = studyReducer(state, { type: 'step', direction: 'back' })
    expect(state.current).toBe('e2e4 e7e5')
    // Forward again: into the variation just seen, not the game.
    state = studyReducer(state, { type: 'step', direction: 'forward' })
    expect(state.current).toBe('e2e4 e7e5 b1c3')
    // Clicking a game move makes the game the line again.
    state = studyReducer(state, { type: 'goto', id: 'e2e4 e7e5 g1f3' })
    state = studyReducer(state, { type: 'step', direction: 'end' })
    expect(state.current).toBe('e2e4 e7e5 g1f3 b8c6 f1b5')
  })

  it("plays an engine's line, and deletes a variation the position is in", () => {
    let state = startStudy(game, 1)
    state = studyReducer(state, { type: 'playLine', moves: ['c7c5', 'g1f3'] })
    expect(state.current).toBe('e2e4 c7c5 g1f3')
    state = studyReducer(state, { type: 'delete', id: 'e2e4 c7c5' })
    expect(state.current).toBe('e2e4')
    expect(state.tree.nodes['e2e4 c7c5']).toBeUndefined()
    // The game's moves stay.
    expect(studyReducer(state, { type: 'delete', id: 'e2e4 e7e5' })).toBe(state)
  })

  it('notes the errors, evaluations and time spent of each move', () => {
    const review = {
      positions: [0, 30, 20, 40, 35, 300].map((cp) => ({ cp })),
      mistakes: [{ ply: 2 }],
      opponentErrors: [3],
    } as unknown as ReviewedGame
    const notes = moveNotes(game, review)
    expect(notes).toHaveLength(6)
    expect(notes[3]).toEqual({ cp: 40, mine: true, spent: 9 })
    expect(notes[4]).toMatchObject({ theirs: true })
    expect(notes[1]).toEqual({ cp: 30, spent: 1 })
    expect(moveNotes(game, undefined)[5]).toEqual({ spent: 10 })
  })
})
