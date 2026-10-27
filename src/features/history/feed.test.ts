import { describe, expect, it } from 'vitest'
import type { ChessComGame } from '@/lib/chesscom/types'
import type { LichessGame } from '@/lib/lichess/types'
import { nextPage, startFeed, type FeedFetchers } from './feed'

const DAY = 86_400_000

function lichessGame(id: string, day: number, overrides: Partial<LichessGame> = {}): LichessGame {
  return {
    id,
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    perf: 'blitz',
    createdAt: day * DAY,
    lastMoveAt: day * DAY + 600_000,
    status: 'resign',
    players: {
      white: { user: { id: 'alice', name: 'Alice' }, rating: 1500, ratingDiff: 7 },
      black: { user: { id: 'bob', name: 'Bob' }, rating: 1600, ratingDiff: -7 },
    },
    winner: 'white',
    moves: '',
    clock: { initial: 180, increment: 2, totalTime: 260 },
    ...overrides,
  }
}

function chessComGame(
  uuid: string,
  day: number,
  rating: number,
  timeClass = 'blitz',
): ChessComGame {
  return {
    url: `https://www.chess.com/game/live/${uuid}`,
    uuid,
    time_control: '180+2',
    time_class: timeClass,
    rules: 'chess',
    rated: true,
    end_time: (day * DAY) / 1000,
    white: { username: 'Alice', rating, result: 'win' },
    black: { username: 'carol', rating: 1400, result: 'resigned' },
  }
}

describe('history feed', () => {
  it('merges both platforms newest first, page by page', async () => {
    const lichess = [lichessGame('l3', 30), lichessGame('l2', 20), lichessGame('l1', 10)]
    const fetchers: FeedFetchers = {
      lichessPage: async (_user, _max, until) =>
        lichess.filter((game) => until === undefined || game.createdAt <= until),
      chessComArchives: async () => ['m1', 'm2'],
      chessComMonth: async (url: string) =>
        url === 'm2'
          ? [chessComGame('c2', 25, 1210), chessComGame('c3', 28, 1200)]
          : [chessComGame('c1', 5, 1190)],
    }
    const state = startFeed([
      { source: 'lichess', username: 'alice' },
      { source: 'chesscom', username: 'alice' },
    ])

    const first = await nextPage(state, fetchers, undefined, 3)
    expect(first.games.map((game) => game.id)).toEqual(['l3', 'c3', 'c2'])
    expect(first.hasMore).toBe(true)

    const second = await nextPage(first.state, fetchers, undefined, 3)
    expect(second.games.map((game) => game.id)).toEqual(['l2', 'l1', 'c1'])
    // The first page is untouched: its state can be replayed.
    expect(first.state.sources[0]!.buffer.map((game) => game.id)).toEqual(['l2', 'l1'])
  })

  it('lists standard games, rated or casual, like the review (no variants)', async () => {
    const lichess = [
      lichessGame('casual', 40, { rated: false }),
      lichessGame('960', 35, { variant: 'chess960' }),
      lichessGame('l1', 30),
    ]
    const fetchers: FeedFetchers = {
      lichessPage: async () => lichess,
      chessComArchives: async () => ['m1', 'm2'],
      // The newest month has nothing to keep: the feed moves on to the previous one.
      chessComMonth: async (url: string) =>
        url === 'm2'
          ? [
              { ...chessComGame('c-casual', 45, 1200), rated: false },
              { ...chessComGame('c-960', 44, 1200), rules: 'chess960' },
            ]
          : [chessComGame('c1', 20, 1190)],
    }
    const state = startFeed([
      { source: 'lichess', username: 'alice' },
      { source: 'chesscom', username: 'alice' },
    ])

    const page = await nextPage(state, fetchers)
    expect(page.games.map((game) => game.id)).toEqual(['c-casual', 'casual', 'l1', 'c1'])
  })

  it('skips a month Chess.com fails to serve', async () => {
    const fetchers: FeedFetchers = {
      lichessPage: async () => [],
      chessComArchives: async () => ['m1', 'm2'],
      chessComMonth: async (url: string) => (url === 'm2' ? null : [chessComGame('c1', 1, 1180)]),
    }
    const page = await nextPage(startFeed([{ source: 'chesscom', username: 'alice' }]), fetchers)
    expect(page.games.map((game) => game.id)).toEqual(['c1'])
    expect(page.state.failures).toEqual([])
  })

  it('keeps going with the other platform when one fails', async () => {
    const fetchers: FeedFetchers = {
      lichessPage: async () => {
        throw new Error('down')
      },
      chessComArchives: async () => ['m1'],
      chessComMonth: async () => [chessComGame('c1', 1, 1180)],
    }
    const page = await nextPage(
      startFeed([
        { source: 'lichess', username: 'alice' },
        { source: 'chesscom', username: 'alice' },
      ]),
      fetchers,
    )
    expect(page.games.map((game) => game.id)).toEqual(['c1'])
    expect(page.state.failures.map((failure) => failure.source)).toEqual(['lichess'])
  })
})
