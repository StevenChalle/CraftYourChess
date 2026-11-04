import { describe, expect, it } from 'vitest'
import type { ChessComGame } from '@/lib/chesscom/types'
import type { LichessGame } from '@/lib/lichess/types'
import { MATE_CP } from './errors'
import { parseChessComTimeControl, timeControlLabel } from '@/features/games/normalize'
import {
  clockBefore,
  moveTime,
  pgnOpening,
  fromChessComGame,
  fromLichessGame,
  latestGames,
  type ReviewGame,
} from './games'

function lichessGame(overrides: Partial<LichessGame> = {}): LichessGame {
  return {
    id: 'abcd1234',
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    perf: 'blitz',
    createdAt: 1_700_000_000_000,
    lastMoveAt: 1_700_000_300_000,
    status: 'resign',
    players: {
      white: { user: { id: 'alice', name: 'Alice' }, rating: 1500 },
      black: { user: { id: 'bob', name: 'Bob' }, rating: 1600 },
    },
    winner: 'black',
    moves: 'e4 e5 Qh5',
    clock: { initial: 180, increment: 2, totalTime: 260 },
    ...overrides,
  }
}

function chessComGame(overrides: Partial<ChessComGame> = {}): ChessComGame {
  return {
    url: 'https://www.chess.com/game/live/1',
    uuid: 'uuid-1',
    pgn: '[Event "Live Chess"]\n\n1. e4 {[%clk 0:02:59]} 1... e5 2. Nf3 1-0',
    time_control: '180+2',
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    end_time: 1_700_000_000,
    white: { username: 'Alice', rating: 1200, result: 'win' },
    black: { username: 'bob', rating: 1250, result: 'resigned' },
    ...overrides,
  }
}

describe('fromLichessGame', () => {
  it('normalizes a game from the player side', () => {
    expect(fromLichessGame(lichessGame(), 'Alice')).toMatchObject({
      source: 'lichess',
      id: 'abcd1234',
      url: 'https://lichess.org/abcd1234',
      playedAt: new Date(1_700_000_300_000),
      category: 'blitz',
      timeControl: { kind: 'clock', initial: 180, increment: 2 },
      color: 'white',
      opponent: { name: 'Bob', rating: 1600 },
      result: 'loss',
      sanMoves: ['e4', 'e5', 'Qh5'],
      serverCps: undefined,
    })
  })

  it('handles black, draws and daily games', () => {
    const game = fromLichessGame(
      lichessGame({ winner: undefined, clock: undefined, daysPerTurn: 3, speed: 'correspondence' }),
      'bob',
    )
    expect(game).toMatchObject({
      color: 'black',
      url: 'https://lichess.org/abcd1234/black',
      result: 'draw',
      category: 'daily',
      timeControl: { kind: 'daily', days: 3 },
    })
  })

  it('reads the server analysis as White centipawns', () => {
    const game = fromLichessGame(
      lichessGame({ analysis: [{ eval: 20 }, { mate: -2 }, {}] }),
      'alice',
    )
    expect(game?.serverCps).toEqual([20, -MATE_CP, undefined])
  })

  it('keeps casual games, skips variant and aborted games', () => {
    expect(fromLichessGame(lichessGame({ rated: false }), 'alice')?.rated).toBe(false)
    expect(fromLichessGame(lichessGame({ variant: 'chess960' }), 'alice')).toBeUndefined()
    expect(fromLichessGame(lichessGame({ status: 'aborted' }), 'alice')).toBeUndefined()
  })
})

describe('fromChessComGame', () => {
  it('normalizes a game from the player side, reading moves from the PGN', () => {
    expect(fromChessComGame(chessComGame(), 'bob')).toMatchObject({
      source: 'chesscom',
      id: 'uuid-1',
      playedAt: new Date(1_700_000_000_000),
      category: 'blitz',
      color: 'black',
      opponent: { name: 'Alice', rating: 1200 },
      result: 'loss',
      sanMoves: ['e4', 'e5', 'Nf3'],
      initialFen: undefined,
    })
  })

  it('recognizes draws', () => {
    const game = chessComGame({
      white: { username: 'Alice', rating: 1200, result: 'repetition' },
      black: { username: 'bob', rating: 1250, result: 'repetition' },
    })
    expect(fromChessComGame(game, 'alice')?.result).toBe('draw')
  })

  it('keeps casual games, skips variant games', () => {
    expect(fromChessComGame(chessComGame({ rated: false }), 'bob')?.rated).toBe(false)
    expect(fromChessComGame(chessComGame({ rules: 'chess960' }), 'bob')).toBeUndefined()
  })
})

describe('time controls', () => {
  it('parses Chess.com time controls', () => {
    expect(parseChessComTimeControl('180+2')).toEqual({ kind: 'clock', initial: 180, increment: 2 })
    expect(parseChessComTimeControl('600')).toEqual({ kind: 'clock', initial: 600, increment: 0 })
    expect(parseChessComTimeControl('1/172800')).toEqual({ kind: 'daily', days: 2 })
  })

  it('labels them like the platforms do', () => {
    expect(timeControlLabel({ kind: 'clock', initial: 180, increment: 2 })).toBe('3+2')
    expect(timeControlLabel({ kind: 'clock', initial: 30, increment: 0 })).toBe('½+0')
    expect(timeControlLabel({ kind: 'clock', initial: 90, increment: 1 })).toBe('1.5+1')
    expect(timeControlLabel({ kind: 'daily', days: 3 })).toBe('3 d')
  })
})

describe('latestGames', () => {
  it('keeps the most recent games, all platforms together', () => {
    const at = (day: number) => ({ playedAt: new Date(2026, 0, day) }) as ReviewGame
    expect(latestGames([at(1), at(5), at(3)], 2)).toEqual([at(5), at(3)])
  })
})

describe('pgnOpening', () => {
  const tags = (values: Record<string, string>) => (name: string) => values[name]

  it("reads Lichess's Opening tag, or the name in Chess.com's ECOUrl", () => {
    expect(
      pgnOpening(tags({ Opening: 'Sicilian Defense: Najdorf Variation', ECO: 'B90' })),
    ).toEqual({ name: 'Sicilian Defense: Najdorf Variation', eco: 'B90' })
    expect(
      pgnOpening(
        tags({
          ECOUrl: 'https://www.chess.com/openings/Scandinavian-Defense-Mieses-Kotroc-Variation',
        }),
      ),
    ).toEqual({ name: 'Scandinavian Defense Mieses Kotroc Variation' })
    expect(pgnOpening(tags({ ECO: 'A00' }))).toBeUndefined()
  })
})

describe('moveTime', () => {
  const clock = { initial: 180, increment: 2, total: 260, remaining: [180, 179.5, 175.2, 181] }

  it('is the clock before, minus after, plus the increment', () => {
    // White's second move: 180 before, 175.2 after, +2
    expect(moveTime(clock, 2, true)!.spent).toBeCloseTo(6.8)
    expect(moveTime(clock, 2, true)!.left).toBe(175.2)
    // A premove: about the increment back
    expect(moveTime(clock, 3, true)!.spent).toBeCloseTo(0.5)
  })

  it('leaves out the first moves when the platform does not time them', () => {
    expect(moveTime(clock, 0, false)).toEqual({ left: 180 })
    expect(moveTime(clock, 1, false)).toEqual({ left: 179.5 })
    expect(moveTime(clock, 0, true)).toEqual({ spent: 2, left: 180 })
    expect(moveTime(clock, 9, true)).toBeUndefined()
  })
})

describe('clocks', () => {
  it('reads Lichess clocks (centiseconds) with the expected length of the game', () => {
    const game = fromLichessGame(lichessGame({ clocks: [18000, 17950, 17520] }), 'alice')!
    expect(game.clock).toEqual({
      initial: 180,
      increment: 2,
      total: 260,
      remaining: [180, 179.5, 175.2],
    })
    // Before White's second move: White's clock after the first one
    expect(clockBefore(game.clock!, 0)).toBe(180)
    expect(clockBefore(game.clock!, 2)).toBe(180)
    expect(clockBefore(game.clock!, 3)).toBe(179.5)
  })

  it('reads Chess.com clocks from the PGN comments, only when every move has one', () => {
    const pgn =
      '[Event "Live Chess"]\n\n1. e4 {[%clk 0:02:59]} 1... e5 {[%clk 0:02:58.5]} 2. Nf3 {[%clk 0:02:50]} 1-0'
    expect(fromChessComGame(chessComGame({ pgn }), 'alice')!.clock).toEqual({
      initial: 180,
      increment: 2,
      total: 260,
      remaining: [179, 178.5, 170],
    })
    // The default PGN lacks some clocks; daily games have none
    expect(fromChessComGame(chessComGame(), 'alice')!.clock).toBeUndefined()
    expect(
      fromChessComGame(
        chessComGame({ pgn, time_control: '1/86400', time_class: 'daily' }),
        'alice',
      )!.clock,
    ).toBeUndefined()
  })
})
