import { beforeEach, describe, expect, it } from 'vitest'
import type { GameSummary } from '@/features/games/normalize'
import {
  gamePoints,
  lichessHistoryPoints,
  peakPoint,
  periodBounds,
  periodFromDates,
  periodPreset,
  periodSummary,
  presetPeriod,
} from './history'
import { profileKey } from '../profileSettings'
import {
  loadRatingChartSettings,
  parseRatingChartSettings,
  saveRatingChartSettings,
} from './settings'

const day = (month: number, date: number, hours = 0) => new Date(2026, month, date, hours).getTime()

describe('rating periods', () => {
  const now = day(9, 28, 15)

  it('starts the last days at local midnight, today included', () => {
    expect(periodBounds({ kind: 'last', days: 7 }, now)).toEqual({ from: day(9, 22), to: now })
  })

  it('takes whole days for fixed dates, never after now', () => {
    expect(periodBounds({ kind: 'dates', from: '2026-09-01', to: '2026-09-30' }, now)).toEqual({
      from: day(8, 1),
      to: new Date(2026, 8, 30, 23, 59, 59, 999).getTime(),
    })
    expect(periodBounds({ kind: 'dates', from: '2026-10-01', to: '2026-12-31' }, now).to).toBe(now)
  })

  it('turns presets into periods, and periods back into presets', () => {
    expect(presetPeriod('today')).toEqual({ kind: 'last', days: 1 })
    expect(presetPeriod('lifetime')).toEqual({ kind: 'lifetime' })
    expect(periodPreset({ kind: 'last', days: 182 })).toBe('semester')
    expect(periodPreset({ kind: 'last', days: 12 })).toBeUndefined()
    expect(periodPreset({ kind: 'dates', from: '2026-01-01', to: '2026-01-31' })).toBeUndefined()
  })

  it('starts a lifetime on the day the account was created', () => {
    expect(periodBounds({ kind: 'lifetime' }, now, day(1, 3, 18))).toEqual({
      from: day(1, 3),
      to: now,
    })
  })

  it('slides when the dates end today, stays put otherwise', () => {
    expect(periodFromDates('2026-10-22', '2026-10-28', now)).toEqual({ kind: 'last', days: 7 })
    expect(periodFromDates('2026-09-01', '2026-09-30', now)).toEqual({
      kind: 'dates',
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })
})

describe('rating points', () => {
  const game = (date: number, rating: number | undefined, rated = true, initial = 180) =>
    ({
      source: 'lichess',
      playedAt: new Date(date),
      rating,
      rated,
      timeControl: { kind: 'clock', initial, increment: 0 },
    }) as GameSummary

  it("keeps each day's last rated game, with the day's number of games", () => {
    expect(
      gamePoints([
        game(day(9, 3, 20), 1210),
        game(day(9, 3, 9), 1200),
        game(day(9, 2, 9), 1190),
        game(day(9, 4, 9), 1300, false),
        game(day(9, 4, 10), undefined),
        game(day(9, 4, 11), 1500, true, 15),
      ]),
    ).toEqual([
      { day: day(9, 2), rating: 1190, games: 1 },
      { day: day(9, 3), rating: 1210, games: 2 },
    ])
  })
})

describe('period summary', () => {
  const game = (result: 'win' | 'draw' | 'loss', opponent: number | undefined, rated = true) =>
    ({
      source: 'chesscom',
      playedAt: new Date(day(9, 1)),
      rating: 1500,
      rated,
      timeControl: { kind: 'clock', initial: 180, increment: 0 },
      result,
      opponent: { name: 'x', rating: opponent },
    }) as GameSummary

  it('counts the rated games, their opponents and the performance', () => {
    expect(
      periodSummary([
        game('win', 1500),
        game('win', 1600),
        game('draw', 1400),
        game('loss', 1500),
        game('win', 1000, false),
      ]),
    ).toEqual({
      games: 4,
      record: { win: 2, draw: 1, loss: 1 },
      opponentAverage: 1500,
      performance: 1600,
    })
  })

  it('has no performance without opponent ratings', () => {
    expect(periodSummary([game('win', undefined)])).toEqual({
      games: 1,
      record: { win: 1, draw: 0, loss: 0 },
    })
  })
})

describe('rating peak', () => {
  it('is the highest rating, its first day when reached again', () => {
    const points = [
      { day: 1, rating: 1500 },
      { day: 2, rating: 1540 },
      { day: 3, rating: 1520 },
      { day: 4, rating: 1540 },
    ]
    expect(peakPoint(points)).toEqual({ day: 2, rating: 1540 })
    expect(peakPoint([])).toBeUndefined()
  })
})

describe("Lichess's rating history", () => {
  it('keeps the period, starting with the rating it began with, without games count', () => {
    const history = [
      { name: 'bullet', points: [[2026, 9, 1, 2000] as [number, number, number, number]] },
      {
        name: 'blitz',
        points: [
          [2026, 8, 1, 1500],
          [2026, 8, 20, 1520],
          [2026, 9, 25, 1540],
          [2026, 9, 27, 1560],
        ] as [number, number, number, number][],
      },
    ]
    expect(lichessHistoryPoints(history, 'blitz', day(9, 1), day(9, 26))).toEqual([
      { day: day(9, 1), rating: 1520 },
      { day: day(9, 25), rating: 1540 },
    ])
    expect(lichessHistoryPoints(history, 'rapid', day(9, 1), day(9, 26))).toEqual([])
  })
})

describe('rating chart settings', () => {
  beforeEach(() => localStorage.clear())

  it('reads the saved filters, field by field', () => {
    expect(parseRatingChartSettings(undefined)).toEqual({
      source: 'chesscom',
      category: 'blitz',
      period: { kind: 'last', days: 30 },
    })
    expect(
      parseRatingChartSettings({ source: 'lichess', category: 'daily', period: { kind: 'x' } }),
    ).toEqual({ source: 'lichess', category: 'blitz', period: { kind: 'last', days: 30 } })
    expect(parseRatingChartSettings({ period: { kind: 'lifetime' } }).period).toEqual({
      kind: 'lifetime',
    })
  })

  it('keeps them per profile, whatever the case of the usernames', () => {
    const settings = {
      source: 'lichess' as const,
      category: 'rapid' as const,
      period: { kind: 'dates' as const, from: '2026-01-01', to: '2026-02-01' },
    }
    saveRatingChartSettings(profileKey({ lichess: 'Alice', chesscom: 'bob' }), settings)
    expect(loadRatingChartSettings(profileKey({ lichess: 'alice', chesscom: 'Bob' }))).toEqual(
      settings,
    )
    expect(loadRatingChartSettings(profileKey({ lichess: 'alice' })).category).toBe('blitz')
  })
})
