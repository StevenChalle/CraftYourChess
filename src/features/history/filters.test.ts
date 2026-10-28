import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadHistoryFilters,
  parseHistoryFilters,
  saveHistoryFilters,
  shownAccounts,
} from './filters'

describe('games filters', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to everything, never leaving a group empty', () => {
    const all = {
      sources: ['lichess', 'chesscom'],
      categories: [],
      results: ['win', 'draw', 'loss'],
    }
    expect(parseHistoryFilters(undefined)).toEqual(all)
    expect(parseHistoryFilters({ sources: [], results: ['nope'], categories: 'blitz' })).toEqual(
      all,
    )
    expect(
      parseHistoryFilters({
        sources: ['chesscom'],
        categories: ['bullet', 'blitz', 'rapid', 'classical', 'daily'],
        results: ['loss'],
      }),
    ).toEqual({ sources: ['chesscom'], categories: [], results: ['loss'] })
  })

  it('shows every account when none of the saved platforms is left', () => {
    const accounts = [{ source: 'lichess' as const, username: 'alice' }]
    const filters = parseHistoryFilters({ sources: ['chesscom'] })
    expect(shownAccounts(accounts, filters)).toEqual(accounts)
  })

  it('keeps them per profile', () => {
    const filters = parseHistoryFilters({ categories: ['blitz'], results: ['win'] })
    saveHistoryFilters('lichess:alice', filters)
    expect(loadHistoryFilters('lichess:alice')).toEqual(filters)
    expect(loadHistoryFilters('lichess:bob').categories).toEqual([])
  })
})
