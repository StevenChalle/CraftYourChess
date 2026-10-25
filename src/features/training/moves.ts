import { Chess, parseSquare, parseUci, squareRank, type Move } from 'chessops'
import { normalizeMove } from 'chessops/chess'
import { chessgroundDests } from 'chessops/compat'
import { parseFen } from 'chessops/fen'
import { makeSan } from 'chessops/san'
import { moveEquals } from 'chessops/util'
import { describePosition, standardUci, type GamePosition } from '@/features/review/positions'

/** Board helpers on FEN + UCI strings, the format shared by the engine, the board and our data. */

export function positionFromFen(fen: string): Chess {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap()
}

function legalMove(position: Chess, uci: string): Move | undefined {
  const move = parseUci(uci)
  if (!move) return undefined
  const normalized = normalizeMove(position, move)
  return position.isLegal(normalized) ? normalized : undefined
}

/** Legal destinations per square, as chessground wants them. */
export function legalDests(fen: string) {
  return chessgroundDests(positionFromFen(fen))
}

/** Same move, whatever the castling notation (e1g1 / e1h1). */
export function sameMove(fen: string, a: string, b: string): boolean {
  const position = positionFromFen(fen)
  const left = legalMove(position, a)
  const right = legalMove(position, b)
  return Boolean(left && right && moveEquals(left, right))
}

export function sanOf(fen: string, uci: string): string {
  const position = positionFromFen(fen)
  const move = legalMove(position, uci)
  return move ? makeSan(position, move) : uci
}

/** The position after a legal move, with that move. */
export function play(fen: string, uci: string): GamePosition {
  const position = positionFromFen(fen)
  const move = legalMove(position, uci)
  if (!move) throw new Error(`Illegal move ${uci} in ${fen}`)
  const played = { uci: standardUci(position, move), san: makeSan(position, move) }
  position.play(move)
  return { ...describePosition(position), move: played }
}

export function isCheck(fen: string): boolean {
  return positionFromFen(fen).isCheck()
}

/** A move dragged on the board, as UCI. Promotions always pick a queen (v1). */
export function boardMoveToUci(fen: string, orig: string, dest: string): string {
  const position = positionFromFen(fen)
  const from = parseSquare(orig)
  const to = parseSquare(dest)
  const piece = from === undefined ? undefined : position.board.get(from)
  const promotes =
    piece?.role === 'pawn' && to !== undefined && (squareRank(to) === 0 || squareRank(to) === 7)
  return `${orig}${dest}${promotes ? 'q' : ''}`
}

/** "e2e4" → ["e2", "e4"], for arrows and highlights. */
export function moveSquares(uci: string): [string, string] {
  return [uci.slice(0, 2), uci.slice(2, 4)]
}

/** Lichess's analysis board on this position (works for any game, whatever its platform). */
export function lichessAnalysisUrl(fen: string, color: 'white' | 'black'): string {
  return `https://lichess.org/analysis/${fen.replaceAll(' ', '_')}?color=${color}`
}

/** What lichessGameUrl needs of a game. */
export type GameOnLichess = {
  source: string
  id: string
  sanMoves?: string[]
  initialFen?: string
}

/**
 * The whole game on Lichess, at position `ply` (half-moves played), so that its history can be
 * browsed: a Lichess game on its own page (with Lichess's analysis if it has one), another one
 * loaded move by move into the analysis board. A game from a set-up position cannot be loaded
 * this way: its position alone (`fen`).
 */
export function lichessGameUrl(
  game: GameOnLichess,
  ply: number,
  color: 'white' | 'black',
  fen: string,
): string {
  if (game.source === 'lichess') {
    return `https://lichess.org/${game.id}${color === 'black' ? '/black' : ''}#${ply}`
  }
  if (game.initialFen || !game.sanMoves?.length) return lichessAnalysisUrl(fen, color)
  // "#" (mate) and "+" must not end up as the URL's hash or a space.
  const moves = game.sanMoves.map(encodeURIComponent).join('_')
  return `https://lichess.org/analysis/pgn/${moves}?color=${color}#${ply}`
}
