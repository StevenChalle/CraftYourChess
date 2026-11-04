import { describe, expect, it } from 'vitest'
import { parseBestMove, parseInfo } from './uci'

describe('parseInfo', () => {
  it('reads depth, nodes and a centipawn score', () => {
    expect(
      parseInfo(
        'info depth 12 seldepth 18 multipv 1 score cp 34 nodes 100234 nps 812000 time 123 pv e2e4 e7e5',
      ),
    ).toEqual({
      depth: 12,
      multipv: 1,
      score: { cp: 34 },
      nodes: 100234,
      pv: 'e2e4',
      reply: 'e7e5',
      line: ['e2e4', 'e7e5'],
    })
  })

  it('keeps the whole principal variation, promotions included', () => {
    expect(
      parseInfo('info depth 30 multipv 2 score cp -12 pv g1f3 d7d5 c2c4 e7e6 b7b8q')?.line,
    ).toEqual(['g1f3', 'd7d5', 'c2c4', 'e7e6', 'b7b8q'])
  })

  it('reads a mate score, negative when the side to move gets mated', () => {
    expect(parseInfo('info depth 5 score mate -2 nodes 900 pv h7h8')?.score).toEqual({ mate: -2 })
  })

  it('flags aspiration window bounds', () => {
    expect(parseInfo('info depth 20 score cp 51 lowerbound nodes 5')).toMatchObject({ bound: true })
  })

  it('keeps the first move of the pv, ignores info strings', () => {
    expect(parseInfo('info string NNUE evaluation using nn-1.nnue')).toEqual({})
    expect(parseInfo('info depth 3 pv e2e4 score cp 1')).toEqual({
      depth: 3,
      pv: 'e2e4',
      line: ['e2e4'],
    })
  })

  it('returns undefined for other lines', () => {
    expect(parseInfo('bestmove e2e4')).toBeUndefined()
  })
})

describe('parseBestMove', () => {
  it('returns the move, ignoring ponder', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4')
    expect(parseBestMove('bestmove (none)')).toBe('(none)')
    expect(parseBestMove('info depth 1')).toBeUndefined()
  })
})
