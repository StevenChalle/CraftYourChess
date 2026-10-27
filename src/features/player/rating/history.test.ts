import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/features/games/normalize'
import { gamePoints, lichessHistoryPoints, rangeStart } from './history'
import { parseRatingChartSettings } from './settings'

const day = (month: number, date: number, hours = 0) => new Date(2026, month, date, hours).getTime()

describe('rating history', () => {
  it('starts a range at local midnight, today included', () => {
    expect(rangeStart('7d', day(9, 28, 15))).toBe(day(9, 22))
  })

  it("keeps Lichess's points of the range, starting with the rating it began with", () => {
    const history = [
      { name: 'Bullet', points: [[2026, 9, 1, 2000] as [number, number, number, number]] },
      {
        name: 'Blitz',
        points: [
          [2026, 8, 1, 1500],
          [2026, 8, 20, 1520],
          [2026, 9, 25, 1540],
        ] as [number, number, number, number][],
      },
    ]
    expect(lichessHistoryPoints(history, 'blitz', day(9, 1))).toEqual([
      { day: day(9, 1), rating: 1520 },
      { day: day(9, 25), rating: 1540 },
    ])
    expect(lichessHistoryPoints(history, 'rapid', day(9, 1))).toEqual([])
  })

  it('keeps the last rated game of each day, oldest first', () => {
    const game = (date: number, rating: number | undefined, rated = true) =>
      ({
        source: 'chesscom',
        playedAt: new Date(date),
        rating,
        rated,
        timeControl: { kind: 'clock', initial: 180, increment: 0 },
      }) as GameSummary
    expect(
      gamePoints([
        game(day(9, 3, 20), 1210),
        game(day(9, 3, 9), 1200),
        game(day(9, 2, 9), 1190),
        game(day(9, 4, 9), 1300, false),
        game(day(9, 4, 10), undefined),
      ]),
    ).toEqual([
      { day: day(9, 2), rating: 1190 },
      { day: day(9, 3), rating: 1210 },
    ])
  })

  it('reads the saved filters, field by field', () => {
    expect(parseRatingChartSettings(null)).toEqual({
      source: 'chesscom',
      category: 'blitz',
      range: '30d',
    })
    expect(
      parseRatingChartSettings('{"source":"lichess","category":"chess960","range":"7d"}'),
    ).toEqual({
      source: 'lichess',
      category: 'blitz',
      range: '7d',
    })
    expect(parseRatingChartSettings('nope').range).toBe('30d')
  })
})
