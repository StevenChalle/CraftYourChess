import { describe, expect, it, vi } from 'vitest'
import { completeLines, Stockfish, type LiveAnalysis } from './stockfish'

describe('completeLines', () => {
  it('keeps the deepest complete iteration, ignoring a partial last one', () => {
    const byDepth = new Map([
      [
        11,
        new Map([
          [1, 'a'],
          [2, 'b'],
          [3, 'c'],
        ]),
      ],
      [
        12,
        new Map([
          [1, 'b'],
          [2, 'a'],
          [3, 'd'],
        ]),
      ],
      [13, new Map([[1, 'b']])],
    ])
    expect(completeLines(byDepth)).toEqual(['b', 'a', 'd'])
  })

  it('handles a single line and no line at all', () => {
    expect(completeLines(new Map([[5, new Map([[1, 'a']])]]))).toEqual(['a'])
    expect(completeLines(new Map())).toEqual([])
  })
})

/** Answers UCI like Stockfish would, one search at a time, ending it on "stop" only. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: string[] = []
  private send(line: string) {
    setTimeout(() => this.onmessage?.({ data: line } as MessageEvent))
  }
  postMessage(command: string) {
    this.sent.push(command)
    if (command === 'uci') this.send('uciok')
    if (command === 'isready') this.send('readyok')
    if (command.startsWith('go depth')) {
      this.send('info depth 1 multipv 1 score cp 20 nodes 10 pv e2e4 e7e5')
      this.send('info depth 1 multipv 2 score cp 10 nodes 10 pv d2d4')
      this.send('info depth 2 multipv 1 score cp 25 nodes 50 pv e2e4 e7e5 g1f3')
      this.send('info depth 2 multipv 2 score cp 30 lowerbound nodes 60 pv d2d4')
      this.send('info depth 2 multipv 2 score cp 15 nodes 70 pv d2d4 d7d5')
      this.send('info depth 3 multipv 1 score cp 22 nodes 90 pv e2e4')
    }
    if (command === 'stop') this.send('bestmove e2e4 ponder e7e5')
  }
  terminate() {}
}

describe('Stockfish.analyse', () => {
  it('reports each complete iteration, whole lines best first, until stopped', async () => {
    const workers: FakeWorker[] = []
    vi.stubGlobal(
      'Worker',
      class extends FakeWorker {
        constructor() {
          super()
          workers.push(this)
        }
      },
    )
    const engine = await Stockfish.start('engine.js')
    const updates: LiveAnalysis[] = []
    const search = engine.analyse('fen', { multiPv: 2, depth: 30 }, (update) =>
      updates.push(update),
    )
    await vi.waitFor(() => expect(updates).toHaveLength(2))
    engine.stop()
    await search
    expect(workers[0]!.sent).toContain('setoption name MultiPV value 2')
    expect(workers[0]!.sent).toContain('go depth 30')
    expect(updates.map((update) => update.depth)).toEqual([1, 2])
    expect(updates[1]!.lines).toEqual([
      { moves: ['e2e4', 'e7e5', 'g1f3'], score: { cp: 25 } },
      { moves: ['d2d4', 'd7d5'], score: { cp: 15 } },
    ])
    // Over: the next search can start.
    const next = engine.analyse('fen', { multiPv: 2, depth: 30 }, () => {})
    engine.stop()
    await next
    vi.unstubAllGlobals()
  })
})
