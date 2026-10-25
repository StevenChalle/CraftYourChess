import { describe, expect, it } from 'vitest'
import { MATE_CP } from '@/features/review/errors'
import {
  boardMoveToUci,
  isCheck,
  legalDests,
  lichessAnalysisUrl,
  lichessGameUrl,
  moveSquares,
  play,
  sameMove,
  sanOf,
} from './moves'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// White can castle kingside.
const CASTLE = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5'

describe('moves', () => {
  it('lists legal destinations for the board', () => {
    expect(legalDests(START).get('g1')).toEqual(['f3', 'h3'])
  })

  it('compares moves whatever the castling notation', () => {
    expect(sameMove(CASTLE, 'e1g1', 'e1h1')).toBe(true)
    expect(sameMove(START, 'e2e4', 'e2e3')).toBe(false)
    expect(sameMove(START, 'e2e5', 'e2e5')).toBe(false)
  })

  it('names moves in SAN', () => {
    expect(sanOf(START, 'g1f3')).toBe('Nf3')
    expect(sanOf(CASTLE, 'e1g1')).toBe('O-O')
  })

  it('plays a move, scoring final positions', () => {
    const after = play(START, 'e2e4')
    expect(after.turn).toBe('black')
    expect(after.move).toEqual({ uci: 'e2e4', san: 'e4' })
    const mate = play('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'd8h4')
    expect(mate.finalCp).toBe(-MATE_CP)
    expect(isCheck(mate.fen)).toBe(true)
  })

  it('promotes to a queen', () => {
    expect(boardMoveToUci('8/P6k/8/8/8/8/8/K7 w - - 0 1', 'a7', 'a8')).toBe('a7a8q')
    expect(boardMoveToUci(START, 'e2', 'e4')).toBe('e2e4')
  })

  it('splits UCI into squares', () => {
    expect(moveSquares('a7a8q')).toEqual(['a7', 'a8'])
  })

  it('links to the whole game on Lichess, at the position', () => {
    expect(lichessGameUrl({ source: 'lichess', id: 'abcd1234' }, 12, 'black', START)).toBe(
      'https://lichess.org/abcd1234/black#12',
    )
    expect(
      lichessGameUrl(
        { source: 'chesscom', id: '1', sanMoves: ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7#'] },
        4,
        'white',
        START,
      ),
    ).toBe('https://lichess.org/analysis/pgn/e4_e5_Qh5_Nc6_Qxf7%23?color=white#4')
    // From a set-up position: the position alone.
    expect(
      lichessGameUrl(
        { source: 'import', id: '1', sanMoves: ['e4'], initialFen: START },
        1,
        'white',
        START,
      ),
    ).toBe(lichessAnalysisUrl(START, 'white'))
  })

  it('links to the Lichess analysis board', () => {
    expect(lichessAnalysisUrl(START, 'black')).toBe(
      'https://lichess.org/analysis/rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR_w_KQkq_-_0_1?color=black',
    )
  })
})
