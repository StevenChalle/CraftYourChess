import Dexie from 'dexie'
import { accountKey, clearGameStore } from '@/features/games/store'
import { positionKey } from '@/features/review/cache'
import { gameRef } from '@/features/review/gameRef'
import { replay } from '@/features/review/positions'
import { database, type AppDatabase } from '@/lib/db'
import { favoriteAccounts, playerAccounts, type Favorites } from './favorites'

/**
 * The browser's memory of analyses (docs/analysis-cache.md, docs/game-store.md), as the settings
 * show and clear it. The favorites' synced games and their analyses are never cleared here: the
 * background analysis keeps them on its own.
 */

/**
 * What is kept, for the settings: positions, and games analysed. Games, not analyses: two games
 * with the same moves (an early resignation) share one analysis but count twice. Undefined when
 * IndexedDB is unavailable.
 */
export async function memoryStats(
  db: () => AppDatabase = database,
): Promise<{ positions: number; games: number } | undefined> {
  try {
    const app = db()
    let games = 0
    await app.games.each((game) => {
      games += Math.max(game.refs.length, 1)
    })
    return { positions: await app.positions.count(), games }
  } catch {
    return undefined
  }
}

/**
 * Deletes every evaluated position, analysed game and saved game, but those of the favorites'
 * synced games: each favorite's latest games, as many as their options say (both platforms
 * together, as the background analysis counts them), with their analyses and the positions of
 * these analyses (shared with other games or not). The favorites' saved games stay, older ones
 * included: the game store knows which periods it holds whole, and must not get holes in them.
 * False if IndexedDB failed.
 */
export async function clearMemory(
  favorites: Favorites | undefined,
  db: () => AppDatabase = database,
): Promise<boolean> {
  try {
    const app = db()
    const accounts = favorites
      ? favoriteAccounts(favorites).map(({ source, username }) => accountKey(source, username))
      : []
    // Each favorite's latest games, as the analyses refer to them.
    const refs = new Set<string>()
    for (const player of favorites?.players ?? []) {
      const latest = []
      for (const { source, username } of playerAccounts(player)) {
        const account = accountKey(source, username)
        latest.push(
          ...(await app.accountGames
            .where('[account+playedAt]')
            .between([account, Dexie.minKey], [account, Dexie.maxKey])
            .reverse()
            .limit(player.depth)
            .toArray()),
        )
      }
      latest.sort((a, b) => b.playedAt - a.playedAt)
      for (const game of latest.slice(0, player.depth)) refs.add(gameRef(game.summary))
    }
    const kept = await app.games.filter((game) => game.refs.some((ref) => refs.has(ref))).toArray()
    const hashes = new Set(kept.map((game) => game.hash))
    const keys = new Set(
      kept.flatMap((game) =>
        replay(game.sanMoves, game.initialFen).map((position) => positionKey(position.fen)),
      ),
    )
    await app.transaction('rw', app.positions, app.games, async () => {
      await app.positions.filter((position) => !keys.has(position.key)).delete()
      await app.games.filter((game) => !hashes.has(game.hash)).delete()
    })
    return await clearGameStore(accounts, () => app)
  } catch {
    return false
  }
}
