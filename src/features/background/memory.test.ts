import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toStoredGame } from '@/features/games/store'
import { movesHash, positionKey } from '@/features/review/cache'
import { replay } from '@/features/review/positions'
import { AppDatabase, DB_NAME } from '@/lib/db'
import type { LichessGame } from '@/lib/lichess/types'
import { clearMemory } from './memory'

const lichessGame = (id: string, white: string, black: string): LichessGame => ({
  id,
  rated: true,
  variant: 'standard',
  speed: 'blitz',
  perf: 'blitz',
  createdAt: 1000,
  lastMoveAt: 2000,
  status: 'resign',
  players: {
    white: { user: { id: white, name: white }, rating: 1500 },
    black: { user: { id: black, name: black }, rating: 1600 },
  },
  winner: 'white',
  moves: 'e4 e5',
  clock: { initial: 180, increment: 0, totalTime: 180 },
})

const keysOf = (sanMoves: string[]) => replay(sanMoves).map((position) => positionKey(position.fen))

let db: AppDatabase

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
  db = new AppDatabase()
  // Alice, a favorite, and Bob, only searched: a game each, analysed.
  await db.accountGames.bulkPut([
    toStoredGame('lichess', 'alice', lichessGame('a1', 'alice', 'carol'))!,
    toStoredGame('lichess', 'bob', lichessGame('b1', 'bob', 'dave'))!,
  ])
  await db.accountSync.bulkPut([
    { account: 'lichess:alice', usedAt: 1 },
    { account: 'lichess:bob', usedAt: 1 },
  ])
  const analysis = { version: 1, engine: 'sf', quickNodes: 1, deepNodes: 2 }
  await db.games.bulkPut([
    {
      hash: movesHash(['e4', 'e5']),
      refs: ['lichess:a1'],
      sanMoves: ['e4', 'e5'],
      playedAt: 2000,
      analysis,
      usedAt: 1,
    },
    {
      hash: movesHash(['d4', 'd5']),
      refs: ['lichess:b1'],
      sanMoves: ['d4', 'd5'],
      playedAt: 2000,
      analysis,
      usedAt: 1,
    },
  ])
  const keys = new Set([...keysOf(['e4', 'e5']), ...keysOf(['d4', 'd5'])])
  await db.positions.bulkPut(
    [...keys].map((key) => ({
      key,
      engine: 'sf',
      score: { cp: 0 },
      bestMove: 'e2e4',
      nodes: 1,
      usedAt: 1,
    })),
  )
})

afterEach(() => db.close())

describe('clearMemory', () => {
  it("keeps the favorites' games, their analyses and their positions only", async () => {
    const favorites = { players: [{ lichess: 'Alice', depth: 50, deep: true }] }
    expect(await clearMemory(favorites, () => db)).toBe(true)
    expect(await db.accountGames.toCollection().primaryKeys()).toEqual([['lichess:alice', 'a1']])
    expect(await db.accountSync.toCollection().primaryKeys()).toEqual(['lichess:alice'])
    expect(await db.games.toCollection().primaryKeys()).toEqual([movesHash(['e4', 'e5'])])
    // The starting position, shared with Bob's game, stays.
    expect(
      new Set(await db.positions.toArray().then((rows) => rows.map((row) => row.key))),
    ).toEqual(new Set(keysOf(['e4', 'e5'])))
  })

  it("keeps only the analyses of each favorite's latest games, both platforms together", async () => {
    // Alice's game a1 (played at 2000) and an older one, a0, analysed too.
    const older = { ...lichessGame('a0', 'alice', 'carol'), createdAt: 500, lastMoveAt: 900 }
    await db.accountGames.put(toStoredGame('lichess', 'alice', older)!)
    const analysis = { version: 1, engine: 'sf', quickNodes: 1, deepNodes: 2 }
    await db.games.put({
      hash: movesHash(['c4']),
      refs: ['lichess:a0'],
      sanMoves: ['c4'],
      playedAt: 900,
      analysis,
      usedAt: 1,
    })
    // Alice follows her latest game only.
    await clearMemory({ players: [{ lichess: 'alice', depth: 1, deep: false }] }, () => db)
    expect(await db.games.toCollection().primaryKeys()).toEqual([movesHash(['e4', 'e5'])])
    // Her saved games all stay: the store holds whole periods.
    expect(await db.accountGames.count()).toBe(2)
  })

  it('clears everything without favorites', async () => {
    expect(await clearMemory(undefined, () => db)).toBe(true)
    expect(await db.accountGames.count()).toBe(0)
    expect(await db.games.count()).toBe(0)
    expect(await db.positions.count()).toBe(0)
  })
})
