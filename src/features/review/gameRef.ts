import type { GameSummary } from '@/features/games/normalize'

/**
 * A game to analyse on its own, as written in the URL (?game=): "lichess:<id>", or
 * "chesscom:<YYYY>-<MM>:<uuid>" since Chess.com only serves games by monthly archive (the month
 * the game ended, in UTC). An imported game: "import:<id>", in the batch imported.
 */
export type GameRef =
  | { source: 'lichess'; id: string }
  | { source: 'chesscom'; id: string; year: number; month: number }
  | { source: 'import'; id: string }

export function gameRef(game: Pick<GameSummary, 'source' | 'id' | 'playedAt'>): string {
  if (game.source === 'lichess') return `lichess:${game.id}`
  if (game.source === 'import') return `import:${game.id}`
  const year = game.playedAt.getUTCFullYear()
  const month = String(game.playedAt.getUTCMonth() + 1).padStart(2, '0')
  return `chesscom:${year}-${month}:${game.id}`
}

export function parseGameRef(value: unknown): GameRef | undefined {
  if (typeof value !== 'string') return undefined
  const lichess = /^lichess:([A-Za-z0-9]{8})$/.exec(value)
  if (lichess) return { source: 'lichess', id: lichess[1]! }
  const imported = /^import:([a-z0-9]+)$/.exec(value)
  if (imported) return { source: 'import', id: imported[1]! }
  const chesscom = /^chesscom:(\d{4})-(\d{2}):([\w-]+)$/.exec(value)
  if (!chesscom) return undefined
  const month = Number(chesscom[2])
  if (month < 1 || month > 12) return undefined
  return { source: 'chesscom', id: chesscom[3]!, year: Number(chesscom[1]), month }
}
