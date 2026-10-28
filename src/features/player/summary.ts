import type { ChessComCategoryKey, ChessComPlayer, ChessComRecord } from '@/lib/chesscom/types'
import type { ApiSource } from '@/lib/http'
import type { LichessUser, PerfKey } from '@/lib/lichess/types'

/**
 * Platform-neutral view of an account, used by the combined overview.
 * Ratings stay per source: Lichess (Glicko-2) and Chess.com ratings are not comparable.
 */

export type Category = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'

export const CATEGORIES: Category[] = ['bullet', 'blitz', 'rapid', 'classical', 'daily']

export const SOURCE_LABELS: Record<ApiSource, string> = {
  lichess: 'Lichess',
  chesscom: 'Chess.com',
}

export type GameRecord = {
  win: number
  loss: number
  draw: number
}

export type CategoryStats = {
  rating?: number
  provisional?: boolean
  /** Rated games in this category */
  games: number
}

export type AccountSummary = {
  source: ApiSource
  username: string
  url: string
  title?: string
  avatarUrl?: string
  closed: boolean
  /** Lichess: terms of service violation. Chess.com: fair play closure. */
  flagged: boolean
  joinedAt?: Date
  lastSeenAt?: Date
  categories: Partial<Record<Category, CategoryStats>>
  record?: GameRecord
}

const LICHESS_PERFS: Record<Category, PerfKey> = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  daily: 'correspondence',
}

export function fromLichess(user: LichessUser): AccountSummary {
  const categories: AccountSummary['categories'] = {}
  for (const key of CATEGORIES) {
    const perf = user.perfs?.[LICHESS_PERFS[key]]
    // UltraBullet games count as bullet games (as in the review), but its rating is a separate
    // pool: the bullet rating is never replaced by it.
    const extraGames = key === 'bullet' ? (user.perfs?.ultraBullet?.games ?? 0) : 0
    const games = (perf?.games ?? 0) + extraGames
    // Lichess reports a default 1500? rating for unplayed perfs: ignore them.
    if (games > 0) {
      categories[key] = perf?.games
        ? { rating: perf.rating, provisional: perf.prov, games }
        : { games }
    }
  }
  return {
    source: 'lichess',
    username: user.username,
    url: user.url ?? `https://lichess.org/@/${user.username}`,
    title: user.title,
    closed: Boolean(user.disabled),
    flagged: Boolean(user.tosViolation),
    joinedAt: user.createdAt ? new Date(user.createdAt) : undefined,
    lastSeenAt: user.seenAt ? new Date(user.seenAt) : undefined,
    categories,
    record: user.count && { win: user.count.win, loss: user.count.loss, draw: user.count.draw },
  }
}

const CHESSCOM_CATEGORIES: Partial<Record<Category, ChessComCategoryKey>> = {
  bullet: 'chess_bullet',
  blitz: 'chess_blitz',
  rapid: 'chess_rapid',
  daily: 'chess_daily',
}

const CHESSCOM_RECORD_KEYS: ChessComCategoryKey[] = [
  'chess_bullet',
  'chess_blitz',
  'chess_rapid',
  'chess_daily',
  'chess960_daily',
]

function recordTotal(record: ChessComRecord | undefined): number {
  return record ? record.win + record.loss + record.draw : 0
}

export function fromChessCom({ profile, stats }: ChessComPlayer): AccountSummary {
  const categories: AccountSummary['categories'] = {}
  for (const key of CATEGORIES) {
    const statsKey = CHESSCOM_CATEGORIES[key]
    const category = statsKey && stats[statsKey]
    if (category?.last) {
      categories[key] = { rating: category.last.rating, games: recordTotal(category.record) }
    }
  }

  const record = sumRecords(CHESSCOM_RECORD_KEYS.map((key) => stats[key]?.record))
  const status = profile.status ?? ''

  return {
    source: 'chesscom',
    // The API lowercases usernames; the profile URL keeps the display casing.
    username: profile.url.split('/').pop() || profile.username,
    url: profile.url,
    title: profile.title,
    avatarUrl: profile.avatar,
    closed: status.startsWith('closed'),
    flagged: status === 'closed:fair_play_violations',
    joinedAt: profile.joined ? new Date(profile.joined * 1000) : undefined,
    lastSeenAt: profile.last_online ? new Date(profile.last_online * 1000) : undefined,
    categories,
    record: record.win + record.loss + record.draw > 0 ? record : undefined,
  }
}

/* ---------- Combining accounts: only for additive data (counts, dates), never ratings ---------- */

export function sumRecords(records: (GameRecord | undefined)[]): GameRecord {
  return records.reduce<GameRecord>(
    (total, record) => ({
      win: total.win + (record?.win ?? 0),
      loss: total.loss + (record?.loss ?? 0),
      draw: total.draw + (record?.draw ?? 0),
    }),
    { win: 0, loss: 0, draw: 0 },
  )
}

export function totalGames(record: GameRecord): number {
  return record.win + record.loss + record.draw
}

export function earliestJoin(accounts: AccountSummary[]): AccountSummary | undefined {
  return accounts
    .filter((account) => account.joinedAt)
    .sort((a, b) => a.joinedAt!.getTime() - b.joinedAt!.getTime())[0]
}

export function latestActivity(accounts: AccountSummary[]): AccountSummary | undefined {
  return accounts
    .filter((account) => account.lastSeenAt)
    .sort((a, b) => b.lastSeenAt!.getTime() - a.lastSeenAt!.getTime())[0]
}

export type CategoryGames = {
  category: Category
  bySource: { source: ApiSource; games: number }[]
  total: number
}

/** Rated games per category, split by source, most played first. Empty categories are dropped. */
export function gamesByCategory(accounts: AccountSummary[]): CategoryGames[] {
  return CATEGORIES.map((key) => {
    const bySource = accounts.map((account) => ({
      source: account.source,
      games: account.categories[key]?.games ?? 0,
    }))
    return {
      category: key,
      bySource,
      total: bySource.reduce((sum, { games }) => sum + games, 0),
    }
  })
    .filter(({ total }) => total > 0)
    .sort((a, b) => b.total - a.total)
}
