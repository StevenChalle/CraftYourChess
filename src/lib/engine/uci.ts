/**
 * Pure parsing of the UCI lines Stockfish prints. https://backscattering.de/chess/uci/
 */

/** Engine score, from the point of view of the side to move. */
export type EngineScore = { cp: number } | { mate: number }

export type InfoLine = {
  depth?: number
  multipv?: number
  nodes?: number
  score?: EngineScore
  /** Lower or upper bound from an aspiration window: not a final score. */
  bound?: boolean
  /** First move of the principal variation (UCI) */
  pv?: string
  /** Second move of the principal variation: the expected reply to `pv` */
  reply?: string
  /** The whole principal variation (UCI), `pv` first */
  line?: string[]
}

const NUMBER_FIELDS = ['depth', 'multipv', 'nodes'] as const

/** e2e4, e7e8q */
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/

export function parseInfo(line: string): InfoLine | undefined {
  if (!line.startsWith('info ')) return undefined
  const tokens = line.split(' ')
  const info: InfoLine = {}
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!
    // The principal variation runs to the end of the line.
    if (token === 'pv') {
      const moves = tokens.slice(i + 1)
      const end = moves.findIndex((move) => !UCI_MOVE.test(move))
      const line = end === -1 ? moves : moves.slice(0, end)
      if (line[0]) {
        info.pv = line[0]
        info.line = line
      }
      if (line[1]) info.reply = line[1]
      break
    }
    if (token === 'string') break
    if ((NUMBER_FIELDS as readonly string[]).includes(token)) {
      info[token as (typeof NUMBER_FIELDS)[number]] = Number(tokens[++i])
    } else if (token === 'score') {
      const kind = tokens[++i]
      const value = Number(tokens[++i])
      if (kind === 'cp') info.score = { cp: value }
      else if (kind === 'mate') info.score = { mate: value }
    } else if (token === 'lowerbound' || token === 'upperbound') {
      info.bound = true
    }
  }
  return info
}

/** "bestmove e2e4 ponder e7e5" → "e2e4". "(none)" when there is no legal move. */
export function parseBestMove(line: string): string | undefined {
  if (!line.startsWith('bestmove')) return undefined
  return line.split(' ')[1] ?? '(none)'
}
