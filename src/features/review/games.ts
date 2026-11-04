import { parseComment, parsePgn } from 'chessops/pgn'
import {
  isStandardGame,
  parseChessComTimeControl,
  summarizeChessComGame,
  summarizeLichessGame,
  type GameSummary,
} from '@/features/games/normalize'
import type { ChessComGame } from '@/lib/chesscom/types'
import type { LichessGame } from '@/lib/lichess/types'
import { toCp } from './errors'

/** A game of the reviewed player, with what the analysis needs. */
export type ReviewGame = GameSummary & {
  sanMoves: string[]
  /** Only for games that did not start from the standard position */
  initialFen?: string
  /**
   * Lichess server analysis, when the game was analysed: White's-side centipawns
   * of the position after each move (index i = after move i + 1).
   */
  serverCps?: (number | undefined)[]
  /** Timed games whose clocks are known (not correspondence) */
  clock?: GameClock
}

/** Seconds. `remaining[i]`: the mover's clock right after move i + 1. */
export type GameClock = {
  initial: number
  /** Added after each move */
  increment: number
  /** Initial time plus 40 increments: the expected length of the game (Lichess's estimate) */
  total: number
  remaining: number[]
}

/** The player's clock before the move at `ply` (the one after their previous move). */
export function clockBefore(clock: GameClock, ply: number): number | undefined {
  return ply < 2 ? clock.initial : clock.remaining[ply - 2]
}

export function gameClock(
  initial: number,
  increment: number,
  remaining: (number | undefined)[],
): GameClock | undefined {
  if (remaining.length === 0 || remaining.some((value) => value === undefined)) return undefined
  return { initial, increment, total: initial + 40 * increment, remaining: remaining as number[] }
}

/**
 * The time the mover spent on the move at `ply` (its clock before, minus after, plus the
 * increment) and what they had left after it, in seconds. `firstMovesTimed`: false on Lichess,
 * whose clocks only start after each side's first move: no time spent for those.
 */
export function moveTime(
  clock: GameClock,
  ply: number,
  firstMovesTimed: boolean,
): { spent?: number; left: number } | undefined {
  const left = clock.remaining[ply]
  const before = clockBefore(clock, ply)
  if (left === undefined || before === undefined) return undefined
  if (ply < 2 && !firstMovesTimed) return { left }
  return { spent: Math.max(0, before - left + clock.increment), left }
}

/** undefined for games outside the review: variants, aborted, or without the player. */
export function fromLichessGame(game: LichessGame, username: string): ReviewGame | undefined {
  const summary = summarizeLichessGame(game, username)
  if (!summary || !isStandardGame(summary)) return undefined
  return {
    ...summary,
    sanMoves: game.moves ? game.moves.split(' ') : [],
    initialFen: game.initialFen,
    serverCps: game.analysis?.map((entry) =>
      entry.eval !== undefined
        ? entry.eval
        : entry.mate !== undefined
          ? toCp({ mate: entry.mate })
          : undefined,
    ),
    clock:
      game.clock && game.clocks
        ? gameClock(
            game.clock.initial,
            game.clock.increment,
            game.clocks.map((centiseconds) => centiseconds / 100),
          )
        : undefined,
  }
}

/** Standard chess (rated or casual) with moves: the only games we review. */
export function isReviewableChessComGame(game: ChessComGame): boolean {
  return game.rules === 'chess' && Boolean(game.pgn)
}

export function fromChessComGame(game: ChessComGame, username: string): ReviewGame | undefined {
  if (!isReviewableChessComGame(game)) return undefined
  const summary = summarizeChessComGame(game, username)
  if (!summary) return undefined
  const pgn = parsePgn(game.pgn!)[0]
  const nodes = pgn ? [...pgn.moves.mainline()] : []
  // Clocks are in the moves' comments: {[%clk 0:02:58.5]}.
  const timeControl = parseChessComTimeControl(game.time_control)
  return {
    ...summary,
    sanMoves: nodes.map((node) => node.san),
    initialFen: pgn?.headers.get('SetUp') === '1' ? pgn.headers.get('FEN') : undefined,
    clock:
      timeControl.kind === 'clock'
        ? gameClock(
            timeControl.initial,
            timeControl.increment,
            nodes.map((node) =>
              node.comments
                ?.map((comment) => parseComment(comment).clock)
                .find((clock) => clock !== undefined),
            ),
          )
        : undefined,
  }
}

/** The `max` most recent games, all platforms together. */
export function latestGames<G extends GameSummary>(games: G[], max: number): G[] {
  return games.toSorted((a, b) => b.playedAt.getTime() - a.playedAt.getTime()).slice(0, max)
}
