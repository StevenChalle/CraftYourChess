import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGameStore, type GameStore } from '@/features/games/store'
import type { ChessComGame } from '@/lib/chesscom/types'
import { AppDatabase, DB_NAME } from '@/lib/db'
import type { GameExportOptions } from '@/lib/lichess/client'
import type { LichessGame } from '@/lib/lichess/types'
import { findGames, type GameFetchers } from './fetch'
import { defaultSelection, type GameSelection } from './selection'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = 1000 * DAY

function lichessGame(id: string, createdAt: number, perf = 'blitz', white = 'alice'): LichessGame {
  return {
    id,
    rated: true,
    variant: 'standard',
    speed: perf === 'correspondence' ? 'correspondence' : (perf as LichessGame['speed']),
    perf,
    createdAt,
    lastMoveAt: createdAt + 600_000,
    status: 'resign',
    players: {
      white: { user: { id: white, name: white }, rating: 1500 },
      black: {
        user: white === 'alice' ? { id: 'zed', name: 'zed' } : { id: 'alice', name: 'alice' },
        rating: 1600,
      },
    },
    winner: 'white',
    moves: 'e4 e5 Nf3',
    clock: perf === 'correspondence' ? undefined : { initial: 180, increment: 0, totalTime: 180 },
  } as LichessGame
}

/** What Lichess holds, and every export asked for. */
let server: LichessGame[]
let calls: GameExportOptions[]
let failAfter: number

/** Lichess's export: perfs, dates on the start, newest first, `max`; streamed game by game. */
const lichessExport: GameFetchers['lichessExport'] = async (_user, options, _signal, onGame) => {
  calls.push(options)
  const games = server
    .filter(
      (game) =>
        options.perfTypes.includes(game.perf) &&
        game.createdAt >= (options.since ?? 0) &&
        game.createdAt <= (options.until ?? Infinity),
    )
    .toSorted((a, b) => b.createdAt - a.createdAt)
    .slice(0, options.max ?? Infinity)
  games.forEach((game, index) => {
    if (index >= failAfter) throw new Error('Network down')
    onGame?.(game)
  })
  return games
}

let db: AppDatabase
let store: GameStore
let now: number

const lichessOnly = [{ source: 'lichess' as const, username: 'Alice' }]
const latest = (count: number): GameSelection => ({
  ...defaultSelection(['lichess']),
  scope: { kind: 'latest', count },
})

const search = (selection: GameSelection, withStore = true) =>
  findGames(lichessOnly, selection, {
    fetchers: { lichessExport } as GameFetchers,
    ...(withStore && { store }),
    now: () => now,
  })

const ids = (found: { games: { id: string }[] }) => found.games.map((game) => game.id)

beforeEach(async () => {
  await Dexie.delete(DB_NAME)
  db = new AppDatabase()
  now = NOW
  store = createGameStore(() => db, { now: () => now })
  // A game every hour over the last 10 days, blitz and bullet in turn, and a correspondence one.
  server = Array.from({ length: 240 }, (_, index) =>
    lichessGame(`g${index}`, NOW - (index + 1) * HOUR, index % 2 === 0 ? 'blitz' : 'bullet'),
  )
  server.push(lichessGame('corr', NOW - 20 * DAY, 'correspondence'))
  calls = []
  failAfter = Infinity
})

afterEach(() => db.close())

describe('findGames with the game store, on Lichess', () => {
  it('finds the same games as without it, then only asks for the last hours', async () => {
    const first = await search(latest(10))
    expect(ids(first)).toEqual(ids(await search(latest(10), false)))
    expect(calls[0]).toMatchObject({ max: 10, since: 0, until: NOW })

    calls = []
    now = NOW + HOUR
    server.unshift(lichessGame('new', NOW + HOUR / 2, 'bullet'))
    const second = await search(latest(10))
    expect(ids(second)).toEqual(['new', ...ids(first).slice(0, 9)])
    // The live perfs from 3 hours before the last search, then correspondence on its own.
    expect(calls[0]).toMatchObject({ since: NOW - 3 * HOUR + 1, until: NOW + HOUR })
    expect(calls[0]!.perfTypes).not.toContain('correspondence')
    expect(calls[1]).toMatchObject({ perfTypes: ['correspondence'] })
  })

  it('pages back only below what it already has', async () => {
    await search(latest(10))
    calls = []
    const found = await search(latest(30))
    expect(ids(found)).toEqual(ids(await search(latest(30), false)))
    const back = calls.find((call) => (call.until ?? 0) < NOW - 3 * HOUR)
    // Down from the oldest of the 10 games kept.
    expect(back?.until).toBeLessThan(server[9]!.createdAt)
  })

  it('only downloads the perfs asked for, and filters the color here', async () => {
    const selection: GameSelection = { ...latest(5), categories: ['blitz'], colors: ['black'] }
    server.push(lichessGame('black', NOW - 50 * DAY, 'blitz', 'zed'))
    const found = await search(selection)
    expect(calls.every((call) => call.perfTypes.join() === 'blitz')).toBe(true)
    expect(calls.every((call) => call.color === undefined)).toBe(true)
    expect(ids(found)).toEqual(['black'])
  })

  it('makes no request for a period already covered', async () => {
    const selection: GameSelection = {
      ...defaultSelection(['lichess']),
      categories: ['bullet', 'blitz'],
      scope: { kind: 'range', from: NOW - 5 * DAY, to: NOW - 4 * DAY },
    }
    const first = await search(selection)
    expect(first.games.length).toBe(24)
    calls = []
    const second = await search(selection)
    expect(calls).toEqual([])
    expect(ids(second)).toEqual(ids(first))
  })

  it('keeps what arrived when the export stops', async () => {
    failAfter = 4
    const found = await search(latest(10))
    expect(found.failures.map((failure) => failure.source)).toEqual(['lichess'])
    expect(await db.accountGames.count()).toBe(4)
    const sync = await db.accountSync.get('lichess:alice')
    expect(sync?.lichess?.blitz).toEqual([{ from: server[3]!.createdAt, to: NOW - 3 * HOUR }])
  })

  it('searches as before when the store fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    store = createGameStore(() => {
      throw new Error('no IndexedDB')
    })
    const found = await search(latest(3))
    expect(ids(found)).toEqual(['g0', 'g1', 'g2'])
    warn.mockRestore()
  })
})

describe('findGames with the game store, on Chess.com', () => {
  const chessComGame = (uuid: string, endTime: number): ChessComGame => ({
    url: `https://www.chess.com/game/live/${uuid}`,
    uuid,
    time_control: '180',
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    end_time: endTime / 1000,
    white: { username: 'Alice', rating: 1500, result: 'win' },
    black: { username: 'carol', rating: 1400, result: 'resigned' },
    pgn: '1. e4 e5 1-0',
  })

  it('never asks again for a past month read after its end', async () => {
    const months: Record<string, ChessComGame[]> = {
      'a/2026/09': [chessComGame('sep', Date.UTC(2026, 8, 15))],
      'a/2026/10': [chessComGame('oct', Date.UTC(2026, 9, 15))],
    }
    const opened: string[] = []
    const fetchers = {
      chessComArchives: async () => Object.keys(months),
      chessComMonth: async (url: string) => {
        opened.push(url)
        return months[url]!
      },
    } as unknown as GameFetchers
    now = Date.UTC(2026, 9, 20)
    const run = () =>
      findGames(
        [{ source: 'chesscom', username: 'alice' }],
        { ...defaultSelection(['chesscom']), scope: { kind: 'latest', count: 5 } },
        { fetchers, store, now: () => now },
      )
    expect(ids(await run())).toEqual(['oct', 'sep'])
    opened.length = 0
    now += DAY
    expect(ids(await run())).toEqual(['oct', 'sep'])
    expect(opened).toEqual(['a/2026/10'])
  })

  it('reads again, next time, a month Chess.com failed to serve', async () => {
    const months: Record<string, ChessComGame[] | null> = {
      'a/2026/08': [chessComGame('aug', Date.UTC(2026, 7, 15))],
      'a/2026/09': null,
    }
    const opened: string[] = []
    const fetchers = {
      chessComArchives: async () => Object.keys(months),
      chessComMonth: async (url: string) => {
        opened.push(url)
        return months[url]
      },
    } as unknown as GameFetchers
    now = Date.UTC(2026, 9, 20)
    const run = () =>
      findGames(
        [{ source: 'chesscom', username: 'alice' }],
        { ...defaultSelection(['chesscom']), scope: { kind: 'latest', count: 5 } },
        { fetchers, store, now: () => now },
      )
    const first = await run()
    expect(ids(first)).toEqual(['aug'])
    expect(first.failures).toEqual([])
    opened.length = 0
    months['a/2026/09'] = [chessComGame('sep', Date.UTC(2026, 8, 15))]
    expect(ids(await run())).toEqual(['sep', 'aug'])
    expect(opened).toEqual(['a/2026/09'])
  })
})
