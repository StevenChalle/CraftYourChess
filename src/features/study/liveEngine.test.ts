import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAnalysis } from '@/lib/engine/stockfish'
import { formatScore, LiveEngine, shownLines } from './liveEngine'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

/** Searches until stopped, reporting one iteration; records what it was asked. */
const searches: string[] = []
let stopSearch: (() => void) | undefined
vi.mock('@/lib/engine/stockfish', () => ({
  Stockfish: {
    start: async () => ({
      analyse: (
        fen: string,
        _options: unknown,
        onUpdate: (analysis: LiveAnalysis) => void,
      ): Promise<void> => {
        searches.push(fen)
        onUpdate({ depth: 22, nodes: 1, lines: [{ moves: ['e2e4'], score: { cp: 30 } }] })
        return new Promise((resolve) => (stopSearch = resolve))
      },
      stop: () => stopSearch?.(),
      terminate: () => stopSearch?.(),
    }),
  },
}))

afterEach(() => {
  searches.length = 0
})

describe('LiveEngine', () => {
  it('searches one position at a time, the last one asked, and remembers results', async () => {
    const updates: string[] = []
    const engine = new LiveEngine({
      depth: 22,
      onUpdate: (fen) => updates.push(fen),
      onFailure: (error) => {
        throw error
      },
    })
    engine.analyse(START)
    engine.analyse(AFTER_E4)
    await vi.waitFor(() => expect(searches).toEqual([AFTER_E4]))
    expect(updates).toEqual([AFTER_E4])
    expect(engine.result(AFTER_E4)?.depth).toBe(22)
    engine.analyse(START)
    await vi.waitFor(() => expect(searches).toEqual([AFTER_E4, START]))
    // Searched deep enough already: shown from memory, not searched again.
    engine.analyse(AFTER_E4)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(searches).toEqual([AFTER_E4, START])
    engine.terminate()
  })
})

describe('the live lines, as shown', () => {
  it('are in SAN with White-side scores', () => {
    const lines = shownLines(AFTER_E4, 'black', {
      depth: 20,
      nodes: 1,
      lines: [{ moves: ['e7e5', 'g1f3', 'b8c6'], score: { cp: -25 } }],
    })
    expect(lines).toMatchObject([
      {
        score: { cp: 25 },
        moves: [
          { uci: 'e7e5', san: 'e5' },
          { uci: 'g1f3', san: 'Nf3' },
          { uci: 'b8c6', san: 'Nc6' },
        ],
      },
    ])
  })

  it('formats scores and mates', () => {
    expect(formatScore({ cp: 83 })).toBe('+0.8')
    expect(formatScore({ cp: -130 })).toBe('-1.3')
    expect(formatScore({ mate: 4 })).toBe('#4')
    expect(formatScore({ mate: -2 })).toBe('-#2')
  })
})
