import type { Color } from 'chessops'
import { fromSideToMove, type WhiteScore } from '@/features/review/errors'
import { sanOf, play } from '@/features/training/moves'
import { beginActivity } from '@/lib/activity'
import { Stockfish, type LiveAnalysis } from '@/lib/engine/stockfish'
import { formatSignedTenths } from '@/lib/format'

/** The live analysis's best lines */
export const LIVE_LINES = 3

/** How deep the live analysis goes before resting: a phone's battery matters */
export const LIVE_DEPTH = { desktop: 22, mobile: 18 } as const

/** A line of the live analysis, ready to show: its score (White's side) and its moves in SAN. */
export type ShownLine = {
  score: WhiteScore
  /** Each move, with the position it leads to */
  moves: { uci: string; san: string; fen: string }[]
}

/**
 * One Stockfish analysing the position on screen, one position at a time: asking for another stops
 * the search under way, which ends before the next starts (a position sent during a search crashes
 * the WASM engine). Each position's last result is kept, so that coming back to it shows it at
 * once, and a position already searched to `depth` is not searched again. The engine counts as an
 * activity of the player while it searches (lib/activity.ts): the background analysis waits.
 */
export class LiveEngine {
  private engine: Promise<Stockfish> | undefined
  private started: Stockfish | undefined
  private wanted: string | undefined
  private searching: string | undefined
  private pumping = false
  private endActivity: (() => void) | undefined
  private readonly results = new Map<string, LiveAnalysis>()
  private readonly depth: number
  private readonly onUpdate: (fen: string, analysis: LiveAnalysis) => void
  private readonly onFailure: (error: unknown) => void

  constructor({
    depth,
    onUpdate,
    onFailure,
  }: {
    depth: number
    onUpdate: (fen: string, analysis: LiveAnalysis) => void
    onFailure: (error: unknown) => void
  }) {
    this.depth = depth
    this.onUpdate = onUpdate
    this.onFailure = onFailure
  }

  /** The last result for this position, if it was searched. */
  result(fen: string): LiveAnalysis | undefined {
    return this.results.get(fen)
  }

  /** Searches this position (and stops the search of any other). */
  analyse(fen: string) {
    this.wanted = fen
    const known = this.results.get(fen)
    if (known && known.depth >= this.depth) this.wanted = undefined
    if (this.searching !== undefined && this.searching !== fen) this.started?.stop()
    void this.pump()
  }

  /** Stops searching; the engine stays loaded for the next position. */
  stop() {
    this.wanted = undefined
    this.started?.stop()
  }

  /** Stops for good. */
  terminate() {
    this.wanted = undefined
    this.started?.terminate()
    this.engine = undefined
    this.started = undefined
    this.endActivity?.()
    this.endActivity = undefined
  }

  private async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.wanted !== undefined) {
        const fen = this.wanted
        this.engine ??= Stockfish.start()
        const engine = await this.engine
        this.started = engine
        // Stopped or moved on while the engine was starting.
        if (this.wanted !== fen) continue
        this.endActivity ??= beginActivity()
        this.searching = fen
        await engine.analyse(fen, { multiPv: LIVE_LINES, depth: this.depth }, (analysis) => {
          this.results.set(fen, analysis)
          this.onUpdate(fen, analysis)
        })
        this.searching = undefined
        if (this.wanted === fen) this.wanted = undefined
      }
    } catch (error) {
      this.searching = undefined
      this.wanted = undefined
      // Terminated on purpose: nothing went wrong.
      if (this.engine) this.onFailure(error)
      this.engine = undefined
      this.started = undefined
    } finally {
      this.pumping = false
      this.endActivity?.()
      this.endActivity = undefined
    }
  }
}

/** The engine's lines from `fen`, in SAN, with White's-side scores. */
export function shownLines(fen: string, turn: Color, analysis: LiveAnalysis): ShownLine[] {
  return analysis.lines.map((line) => {
    const moves: ShownLine['moves'] = []
    let current = fen
    for (const uci of line.moves) {
      try {
        const san = sanOf(current, uci)
        current = play(current, uci).fen
        moves.push({ uci, san, fen: current })
      } catch {
        // A line ending on a move the rules refuse (it should not happen): keep what came before.
        break
      }
    }
    return { score: fromSideToMove(line.score, turn), moves }
  })
}

/** "+0.8", "-1.3", "#4" (White mates in 4), "-#2" (Black does). */
export function formatScore(score: WhiteScore): string {
  if ('mate' in score) return score.mate > 0 ? `#${score.mate}` : `-#${-score.mate}`
  return formatSignedTenths(score.cp / 100)
}
