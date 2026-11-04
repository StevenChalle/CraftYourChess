import type { Color } from 'chessops'
import { parseComment, parsePgn, type PgnNodeData, type Game } from 'chessops/pgn'
import {
  parseChessComTimeControl,
  type GameCategory,
  type GameResult,
  type TimeControl,
} from '@/features/games/normalize'
import { toCp } from '@/features/review/errors'
import { gameClock, pgnOpening, type GameOpening, type ReviewGame } from '@/features/review/games'
import { replay } from '@/features/review/positions'

/**
 * Games imported from a PGN (a file or a paste): read here, without knowing yet which side the
 * player had (the import dialog asks), then turned into the games the analysis works on.
 */

/** A game as the PGN tells it. */
export type PgnGame = {
  /** Unique within the batch, from its content: the same game imported twice keeps its id */
  id: string
  /** Order in the file, from 0 */
  index: number
  white: string
  black: string
  whiteElo?: number
  blackElo?: number
  result: '1-0' | '0-1' | '1/2-1/2'
  /** When it was played (or ended), if the PGN says */
  playedAt?: Date
  event?: string
  timeControl: TimeControl
  rated: boolean
  /** Its page (Lichess's Site, Chess.com's Link), if any */
  url?: string
  sanMoves: string[]
  initialFen?: string
  /** The mover's clock after each move (seconds), when the PGN has them */
  clocks: (number | undefined)[]
  /** Evaluation after each move (White's side, centipawns), when the PGN has them (Lichess) */
  evals: (number | undefined)[]
  opening?: GameOpening
}

export type IgnoredGames = {
  /** Unreadable: no moves, an illegal move, a broken starting position */
  unreadable: number
  /** Another variant than standard chess */
  variant: number
  /** No result (still going, or a study) */
  unfinished: number
  /** The same game more than once */
  duplicate: number
}

export type PgnBatch = { games: PgnGame[]; ignored: IgnoredGames }

const STANDARD_VARIANTS = new Set(['', 'standard', 'chess', 'from position', 'fromposition'])
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2'])

/** FNV-1a, in base 36: a short id that stays the same for the same game. */
function hash(text: string): string {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return (value >>> 0).toString(36)
}

const rating = (value: string | undefined) => {
  const number = Number(value)
  return value && Number.isInteger(number) && number > 0 ? number : undefined
}

/** "2026.10.22" (+ "18:45:12"), in UTC as Lichess and Chess.com write them; unknown parts: none. */
function parseDate(date: string | undefined, time: string | undefined): Date | undefined {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date ?? '')
  if (!match) return undefined
  const [hours = 0, minutes = 0, seconds = 0] = (time ?? '').split(':').map(Number)
  const value = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    hours || 0,
    minutes || 0,
    seconds || 0,
  )
  return Number.isNaN(value) ? undefined : new Date(value)
}

function timeControl(tag: string | undefined): TimeControl {
  if (!tag || !/^\d+(\+\d+)?$|^\d+\/\d+$/.test(tag)) return { kind: 'unknown' }
  return parseChessComTimeControl(tag)
}

/** Lichess's speeds, from the expected length: initial time plus 40 increments. */
export function categoryOf(control: TimeControl): GameCategory {
  if (control.kind === 'unknown') return 'unknown'
  if (control.kind === 'daily') return 'daily'
  const total = control.initial + 40 * control.increment
  if (total < 180) return 'bullet'
  if (total < 480) return 'blitz'
  if (total < 1500) return 'rapid'
  return 'classical'
}

function readGame(game: Game<PgnNodeData>, index: number): PgnGame | keyof IgnoredGames {
  // Unknown tags read "?" (or "????.??.??" for a date), as the PGN standard writes them.
  const tag = (name: string) => {
    const value = game.headers.get(name)?.trim()
    return value && !/^[?.]+$/.test(value) && !value.includes('??') ? value : undefined
  }
  if (!STANDARD_VARIANTS.has((tag('Variant') ?? '').toLowerCase())) return 'variant'
  const result = tag('Result')
  if (!result || !RESULTS.has(result)) return 'unfinished'

  const nodes = [...game.moves.mainline()]
  const initialFen = tag('FEN')
  let moves: number
  try {
    moves = replay(
      nodes.map((node) => node.san),
      initialFen,
    ).length
  } catch {
    return 'unreadable'
  }
  // An illegal move stops the replay: such a game is not imported.
  if (nodes.length === 0 || moves !== nodes.length + 1) return 'unreadable'

  const comments = nodes.map((node) => (node.comments ?? []).map(parseComment))
  const url = [tag('Link'), tag('Site')].find((value) => value?.startsWith('http'))
  const white = tag('White') ?? '?'
  const black = tag('Black') ?? '?'
  const sanMoves = nodes.map((node) => node.san)
  const date = tag('UTCDate') ?? tag('EndDate') ?? tag('Date')
  const time = tag('UTCTime') ?? tag('EndTime')
  return {
    id: hash([white, black, date, time, result, initialFen, sanMoves.join(' ')].join('|')),
    index,
    white,
    black,
    whiteElo: rating(tag('WhiteElo')),
    opening: pgnOpening(tag),
    blackElo: rating(tag('BlackElo')),
    result: result as PgnGame['result'],
    playedAt: parseDate(date, time),
    event: tag('Event'),
    timeControl: timeControl(tag('TimeControl')),
    // Lichess writes "Casual Blitz game"; otherwise taken as rated.
    rated: !/casual/i.test(tag('Event') ?? ''),
    url,
    sanMoves,
    initialFen,
    clocks: comments.map((list) => list.find((comment) => comment.clock !== undefined)?.clock),
    evals: comments.map((list) => {
      const evaluation = list.find((comment) => comment.evaluation)?.evaluation
      if (!evaluation) return undefined
      return 'mate' in evaluation
        ? toCp({ mate: evaluation.mate })
        : Math.round(evaluation.pawns * 100)
    }),
  }
}

/** Every game of a PGN text, in its order; the others are counted by reason. */
export function readPgn(text: string): PgnBatch {
  const ignored: IgnoredGames = { unreadable: 0, variant: 0, unfinished: 0, duplicate: 0 }
  const games: PgnGame[] = []
  const seen = new Set<string>()
  for (const [index, game] of parsePgn(text).entries()) {
    const read = readGame(game, index)
    if (typeof read === 'string') ignored[read]++
    else if (seen.has(read.id)) ignored.duplicate++
    else {
      seen.add(read.id)
      games.push(read)
    }
  }
  return { games, ignored }
}

/** The players' names, the most frequent first (a player's name differs only by case). */
export function playerNames(games: PgnGame[]): { name: string; games: number }[] {
  const counts = new Map<string, { name: string; games: number }>()
  for (const game of games) {
    for (const name of new Set([game.white, game.black])) {
      if (name === '?') continue
      const entry = counts.get(name.toLowerCase())
      if (entry) entry.games++
      else counts.set(name.toLowerCase(), { name, games: 1 })
    }
  }
  return [...counts.values()].toSorted((a, b) => b.games - a.games || a.name.localeCompare(b.name))
}

/** The player's side in a game, from their names: undefined when neither (or both) side is theirs. */
export function sideOf(game: PgnGame, names: string[]): Color | undefined {
  const mine = new Set(names.map((name) => name.toLowerCase()))
  const white = mine.has(game.white.toLowerCase())
  const black = mine.has(game.black.toLowerCase())
  if (white === black) return undefined
  return white ? 'white' : 'black'
}

/** What the games do not say, which the app then cannot use. */
export function missingInfo(games: PgnGame[]) {
  return {
    date: games.filter((game) => !game.playedAt).length,
    timeControl: games.filter((game) => game.timeControl.kind === 'unknown').length,
    ratings: games.filter((game) => game.whiteElo === undefined && game.blackElo === undefined)
      .length,
  }
}

/** The game from the player's side, as the analysis and the tables take it. */
export function toReviewGame(game: PgnGame, color: Color): ReviewGame {
  const opponent = color === 'white' ? 'black' : 'white'
  const won = game.result === (color === 'white' ? '1-0' : '0-1')
  const result: GameResult = game.result === '1/2-1/2' ? 'draw' : won ? 'win' : 'loss'
  const control = game.timeControl
  return {
    source: 'import',
    id: game.id,
    url: game.url,
    // Undated games: in 1970, in the file's order (the last one counts as the latest).
    playedAt: game.playedAt ?? new Date(game.index),
    undated: game.playedAt ? undefined : true,
    category: categoryOf(control),
    timeControl: control,
    rated: game.rated,
    color,
    rating: color === 'white' ? game.whiteElo : game.blackElo,
    opponent: {
      name: game[opponent],
      rating: opponent === 'white' ? game.whiteElo : game.blackElo,
    },
    result,
    sanMoves: game.sanMoves,
    initialFen: game.initialFen,
    serverCps: game.evals.some((cp) => cp !== undefined) ? game.evals : undefined,
    clock:
      control.kind === 'clock'
        ? gameClock(control.initial, control.increment, game.clocks)
        : undefined,
    opening: game.opening,
  }
}
