import { describe, expect, it } from 'vitest'
import type { Mistake } from '@/features/review/analyze'
import { errorBreakdown } from './errors'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const ROOK_ENDGAME = '8/5k2/8/8/8/8/2R2K2/8 w - - 0 50'

const mistake = (id: string, ply: number, fen: string, beforeCp = 0, afterCp = -300) =>
  ({ id, ply, fen, beforeCp, afterCp }) as Mistake

describe('errorBreakdown', () => {
  it('puts each error in its phase and keeps the most frequent themes', () => {
    const opening = mistake('a', 4, START)
    const middlegame = mistake('b', 40, START, 300)
    const endgame = mistake('c', 90, ROOK_ENDGAME, 300)
    const { phases, themes } = errorBreakdown([opening, middlegame, endgame])
    expect(phases).toEqual({ opening: [opening], middlegame: [middlegame], endgame: [endgame] })
    // Better and let it go twice, once in a rook endgame; the phases are not themes here.
    expect(themes.map(({ theme, mistakes }) => [theme, mistakes.length])).toEqual([
      ['advantage', 2],
      ['rookEndgame', 1],
    ])
  })
})
