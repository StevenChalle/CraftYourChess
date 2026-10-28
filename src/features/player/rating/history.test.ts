import { beforeEach, describe, expect, it } from 'vitest'
import type { GameSummary } from '@/features/games/normalize'
import { gamePoints, periodBounds, periodFromDates } from './history'
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
