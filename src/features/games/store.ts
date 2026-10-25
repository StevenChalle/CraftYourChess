import Dexie from 'dexie'
import { favoriteAccounts, getFavorites } from '@/features/background/favorites'
import { database, type AccountSync, type AppDatabase, type StoredGame } from '@/lib/db'
import type { ChessComGame } from '@/lib/chesscom/types'
import type { ApiSource } from '@/lib/http'
import type { LichessGame } from '@/lib/lichess/types'
import { storageLimits } from '@/lib/storageLimits'
import {
  isStandardGame,
  summarizeChessComGame,
  summarizeLichessGame,
  type GameSummary,
} from './normalize'
import { mergePeriods, type Period } from './periods'

/**
 * The accounts' games kept in the browser (IndexedDB), with what is known of them: the periods
 * whose Lichess games are all stored (per perf), the Chess.com months read. Searches only ask
 * the platforms for what is missing. Games are kept as the APIs give them, with their summary
 * to filter them without parsing the moves. A cache: when it fails, searches go to the platforms
 * as before (GameStoreError). Design: docs/game-store.md.
 */

/** Change it with the rules of summarizeLichessGame / summarizeChessComGame: summaries are made again. */
export const SUMMARY_VERSION = 1

export class GameStoreError extends Error {
  constructor(cause: unknown) {
    super('Game store unavailable', { cause })
    this.name = 'GameStoreError'
  }
}

/** 'lichess:alice': Chess.com and Lichess usernames are case-insensitive. */
export function accountKey(source: ApiSource, username: string): string {
  return `${source}:${username.toLowerCase()}`
}

function summarize(
  source: ApiSource,
  raw: LichessGame | ChessComGame,
  username: string,
): GameSummary | undefined {
  if (source === 'chesscom') {
    const game = raw as ChessComGame
    // Without moves, there is nothing to review.
    if (game.rules !== 'chess' || !game.pgn) return undefined
    const summary = summarizeChessComGame(game, username)
    return summary && isStandardGame(summary) ? summary : undefined
  }
  const summary = summarizeLichessGame(raw as LichessGame, username)
  return summary && isStandardGame(summary) ? summary : undefined
}

/** The game as stored for `username`'s account; undefined for a game the review cannot use. */
export function toStoredGame(
  source: ApiSource,
  username: string,
  raw: LichessGame | ChessComGame,
): StoredGame | undefined {
  const summary = summarize(source, raw, username)
  if (!summary) return undefined
  return {
    account: accountKey(source, username),
    id: summary.id,
    playedAt: summary.playedAt.getTime(),
    ...(source === 'lichess' && { createdAt: (raw as LichessGame).createdAt }),
    summary,
    summaryVersion: SUMMARY_VERSION,
    raw,
  }
}

/** The stored summary, made again if the rules changed since. */
export function storedSummary(game: StoredGame, username: string): GameSummary | undefined {
  if (game.summaryVersion === SUMMARY_VERSION) return game.summary
  const source = game.account.slice(0, game.account.indexOf(':')) as ApiSource
  return summarize(source, game.raw, username)
}

export type GameStore = {
  /** What is known of the account (nothing yet: no periods, no months). */
  loadSync: (account: string) => Promise<AccountSync>
  put: (games: StoredGame[]) => Promise<void>
  /** Records that every game of these perfs is stored over these periods. */
  addLichessPeriods: (account: string, periods: Record<string, Period>) => Promise<void>
  /** Records that a Chess.com month was read at `time`. */
  markMonth: (account: string, month: string, time: number) => Promise<void>
  /** The account's games played from `from` to `to`, newest first, passing `filter`, at most `limit`. */
  query: (
    account: string,
    from: number,
    to: number,
    filter: (game: StoredGame) => boolean,
    limit?: number,
  ) => Promise<StoredGame[]>
  /** Marks the account as just searched, then frees space if needed (never this account). */
  touch: (account: string) => Promise<void>
}

function isQuotaError(error: unknown): boolean {
  const name = (value: unknown) =>
    typeof value === 'object' && value !== null && 'name' in value ? value.name : undefined
  const inner =
    typeof error === 'object' && error !== null && 'inner' in error ? error.inner : undefined
  return name(error) === 'QuotaExceededError' || name(inner) === 'QuotaExceededError'
}

async function deleteAccount(db: AppDatabase, account: string): Promise<number> {
  const count = await db.accountGames
    .where('[account+playedAt]')
    .between([account, Dexie.minKey], [account, Dexie.maxKey])
    .delete()
  await db.accountSync.delete(account)
  return count
}

/** First day of a Chess.com month ('2026/10'), UTC. */
const monthStart = (month: string) => {
  const [year, number] = month.split('/').map(Number)
  return Date.UTC(year!, number! - 1, 1)
}

/**
 * Deletes the `count` oldest games of all accounts, and shortens what is known of each account
 * accordingly: its Lichess periods start after the latest game removed, its Chess.com months
 * touched are forgotten (asked for again if ever needed).
 */
async function deleteOldest(db: AppDatabase, count: number): Promise<void> {
  const oldest = await db.accountGames.orderBy('playedAt').limit(count).toArray()
  const removed = new Map<string, { createdAt: number; playedAt: number }>()
  for (const game of oldest) {
    const latest = removed.get(game.account)
    removed.set(game.account, {
      createdAt: Math.max(latest?.createdAt ?? -Infinity, game.createdAt ?? game.playedAt),
      playedAt: Math.max(latest?.playedAt ?? -Infinity, game.playedAt),
    })
  }
  await db.transaction('rw', db.accountGames, db.accountSync, async () => {
    await db.accountGames.bulkDelete(
      oldest.map((game): [string, string] => [game.account, game.id]),
    )
    for (const [account, { createdAt, playedAt }] of removed) {
      const sync = await db.accountSync.get(account)
      if (!sync) continue
      const lichess =
        sync.lichess &&
        Object.fromEntries(
          Object.entries(sync.lichess).map(([perf, periods]) => [
            perf,
            periods.flatMap((period) =>
              period.to <= createdAt
                ? []
                : [{ from: Math.max(period.from, createdAt + 1), to: period.to }],
            ),
          ]),
        )
      const chesscomMonths =
        sync.chesscomMonths &&
        Object.fromEntries(
          Object.entries(sync.chesscomMonths).filter(([month]) => monthStart(month) > playedAt),
        )
      await db.accountSync.put({
        ...sync,
        ...(lichess && { lichess }),
        ...(chesscomMonths && { chesscomMonths }),
      })
    }
  })
}

/**
 * Makes room above `max` games, down to 90 % of it (or a tenth less with `force`: the disk is
 * full): first whole accounts, the least recently searched first, but never those of `keep` (the
 * main accounts, the one searched now); then the oldest games of the accounts left. The newest
 * games always come in: older ones are recycled.
 */
async function evict(db: AppDatabase, keep: string[], max: number, force = false): Promise<void> {
  let total = await db.accountGames.count()
  if (!force && total <= max) return
  const target = force ? Math.floor(total * 0.9) : Math.floor(max * 0.9)
  for (const { account } of await db.accountSync.orderBy('usedAt').toArray()) {
    if (total <= target) return
    if (!keep.includes(account)) total -= await deleteAccount(db, account)
  }
  if (total > target) await deleteOldest(db, total - target)
}

export function createGameStore(
  getDatabase: () => AppDatabase,
  {
    now = Date.now,
    maxGames = storageLimits().storedGames,
    kept = () => [],
  }: {
    now?: () => number
    maxGames?: number
    /** Accounts never evicted: the favorites' */
    kept?: () => string[]
  } = {},
): GameStore {
  /** Every failure becomes a GameStoreError, so that callers tell it from the platforms' errors. */
  const guard = async <T>(task: (db: AppDatabase) => Promise<T>): Promise<T> => {
    try {
      return await task(getDatabase())
    } catch (error) {
      throw new GameStoreError(error)
    }
  }
  const emptySync = (account: string): AccountSync => ({ account, usedAt: now() })

  return {
    loadSync: (account) =>
      guard(async (db) => (await db.accountSync.get(account)) ?? emptySync(account)),

    put: (games) =>
      guard(async (db) => {
        if (games.length === 0) return
        try {
          await db.accountGames.bulkPut(games)
        } catch (error) {
          if (!isQuotaError(error)) throw error
          await evict(db, [games[0]!.account, ...kept()], maxGames, true)
          await db.accountGames.bulkPut(games)
        }
      }),

    addLichessPeriods: (account, periods) =>
      guard((db) =>
        db.transaction('rw', db.accountSync, async () => {
          const sync = (await db.accountSync.get(account)) ?? emptySync(account)
          const lichess = { ...sync.lichess }
          for (const [perf, period] of Object.entries(periods)) {
            lichess[perf] = mergePeriods([...(lichess[perf] ?? []), period])
          }
          await db.accountSync.put({ ...sync, lichess })
        }),
      ),

    markMonth: (account, month, time) =>
      guard((db) =>
        db.transaction('rw', db.accountSync, async () => {
          const sync = (await db.accountSync.get(account)) ?? emptySync(account)
          await db.accountSync.put({
            ...sync,
            chesscomMonths: { ...sync.chesscomMonths, [month]: time },
          })
        }),
      ),

    query: (account, from, to, filter, limit) =>
      guard(async (db) => {
        const games = db.accountGames
          .where('[account+playedAt]')
          .between([account, from], [account, to], true, true)
          .reverse()
          .filter(filter)
        return limit === undefined ? games.toArray() : games.limit(limit).toArray()
      }),

    touch: (account) =>
      guard(async (db) => {
        await db.transaction('rw', db.accountSync, async () => {
          const sync = (await db.accountSync.get(account)) ?? emptySync(account)
          await db.accountSync.put({ ...sync, usedAt: now() })
        })
        await evict(db, [account, ...kept()], maxGames)
      }),
  }
}

/** The browser's store, used by the analysis search. The favorites' accounts are never evicted. */
export const gameStore = createGameStore(database, {
  kept: () => {
    const favorites = getFavorites()
    return favorites
      ? favoriteAccounts(favorites).map(({ source, username }) => accountKey(source, username))
      : []
  },
})

/** What the store holds, for the settings. Undefined when IndexedDB is unavailable. */
export async function gameStoreStats(): Promise<{ accounts: number; games: number } | undefined> {
  try {
    const db = database()
    return { accounts: await db.accountSync.count(), games: await db.accountGames.count() }
  } catch {
    return undefined
  }
}

/** The accounts whose games are stored, with how many, most games first. */
export async function storedAccounts(): Promise<{ account: string; games: number }[]> {
  try {
    const db = database()
    const accounts = await db.accountSync.toCollection().primaryKeys()
    const counted = await Promise.all(
      accounts.map(async (account) => ({
        account,
        games: await db.accountGames
          .where('[account+playedAt]')
          .between([account, Dexie.minKey], [account, Dexie.maxKey])
          .count(),
      })),
    )
    return counted.filter(({ games }) => games > 0).toSorted((a, b) => b.games - a.games)
  } catch {
    return []
  }
}

/** Deletes the games of these accounts ('lichess:alice'), and what is known of them. */
export async function deleteStoredAccounts(accounts: string[]): Promise<boolean> {
  try {
    const db = database()
    for (const account of accounts) await deleteAccount(db, account)
    return true
  } catch {
    return false
  }
}

/** Empties the store but for the accounts of `keep` (the analysis cache stays). */
export async function clearGameStore(
  keep: string[] = [],
  open: () => AppDatabase = database,
): Promise<boolean> {
  try {
    const db = open()
    if (keep.length === 0) {
      await db.transaction('rw', db.accountGames, db.accountSync, async () => {
        await db.accountGames.clear()
        await db.accountSync.clear()
      })
      return true
    }
    for (const account of await db.accountSync.toCollection().primaryKeys()) {
      if (!keep.includes(account)) await deleteAccount(db, account)
    }
    return true
  } catch {
    return false
  }
}
