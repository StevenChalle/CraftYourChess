import { describe, expect, it } from 'vitest'
import type { ChessComPlayer } from '@/lib/chesscom/types'
import type { LichessUser } from '@/lib/lichess/types'
import { fromChessCom, fromLichess } from './summary'

const lichessUser: LichessUser = {
  id: 'alice',
  username: 'Alice',
  title: 'FM',
  createdAt: Date.UTC(2015, 0, 1),
  seenAt: Date.UTC(2026, 9, 1),
  profile: { flag: 'FR' },
  perfs: {
    blitz: { games: 120, rating: 2100, rd: 50, prog: 10 },
    rapid: { games: 0, rating: 1500, rd: 500, prog: 0, prov: true },
    correspondence: { games: 3, rating: 1700, rd: 150, prog: 0, prov: true },
  },
  count: { all: 200, rated: 123, win: 100, loss: 80, draw: 20 },
}

const chessComPlayer: ChessComPlayer = {
  profile: {
    player_id: 1,
    username: 'alice',
    url: 'https://www.chess.com/member/Alice',
    country: 'https://api.chess.com/pub/country/BE',
    joined: Date.UTC(2012, 5, 1) / 1000,
    last_online: Date.UTC(2026, 8, 1) / 1000,
    status: 'premium',
  },
  stats: {
    chess_blitz: {
      last: { rating: 1950, date: 0, rd: 40 },
      record: { win: 30, loss: 20, draw: 10 },
    },
    chess_bullet: {
      last: { rating: 1800, date: 0, rd: 60 },
      record: { win: 5, loss: 5, draw: 0 },
    },
    chess960_daily: { record: { win: 1, loss: 0, draw: 0 } },
  },
}

describe('fromLichess', () => {
  const summary = fromLichess(lichessUser)

  it('keeps played categories only, mapping correspondence to daily', () => {
    expect(summary.categories).toEqual({
      blitz: { rating: 2100, provisional: undefined, games: 120 },
      daily: { rating: 1700, provisional: true, games: 3 },
    })
  })

  it('maps profile fields', () => {
    expect(summary).toMatchObject({
      source: 'lichess',
      username: 'Alice',
      url: 'https://lichess.org/@/Alice',
      title: 'FM',
      closed: false,
      record: { win: 100, loss: 80, draw: 20 },
    })
    expect(summary.joinedAt).toEqual(new Date(Date.UTC(2015, 0, 1)))
  })

  it('counts UltraBullet games with bullet, without using its rating', () => {
    const summary = fromLichess({
      id: 'u',
      username: 'U',
      perfs: {
        ultraBullet: { games: 30, rating: 1400 },
        bullet: { games: 10, rating: 1800 },
      },
    })
    expect(summary.categories.bullet).toEqual({ rating: 1800, provisional: undefined, games: 40 })
    const ultraOnly = fromLichess({
      id: 'v',
      username: 'V',
      perfs: { ultraBullet: { games: 5, rating: 1400 } },
    })
    expect(ultraOnly.categories.bullet).toEqual({ games: 5 })
  })

  it('handles closed accounts with no data', () => {
    const closed = fromLichess({ id: 'bob', username: 'Bob', disabled: true })
    expect(closed).toMatchObject({ closed: true, categories: {}, record: undefined })
  })
})

describe('fromChessCom', () => {
  const summary = fromChessCom(chessComPlayer)

  it('uses the display casing from the profile URL', () => {
    expect(summary.username).toBe('Alice')
  })

  it('converts Unix seconds to dates', () => {
    expect(summary.joinedAt).toEqual(new Date(Date.UTC(2012, 5, 1)))
  })

  it('maps categories with their game counts', () => {
    expect(summary.categories).toEqual({
      bullet: { rating: 1800, games: 10 },
      blitz: { rating: 1950, games: 60 },
    })
  })

  it('sums the record across all categories, variants included', () => {
    expect(summary.record).toEqual({ win: 36, loss: 25, draw: 10 })
  })

  it('detects fair play closures', () => {
    const closed = fromChessCom({
      ...chessComPlayer,
      profile: { ...chessComPlayer.profile, status: 'closed:fair_play_violations' },
    })
    expect(closed).toMatchObject({ closed: true, flagged: true })
  })
})
