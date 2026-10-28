import type { GameResult } from '@/features/games/normalize'
import { profileSettingsStore } from '@/features/player/profileSettings'
import { CATEGORIES, type Category } from '@/features/player/summary'
import type { ApiSource } from '@/lib/http'
import { ALL_GAMES, type HistoryAccount, type HistoryFilter } from './feed'

/**
 * The Games tab's filters, per profile and per browser (localStorage), shown again on the next
 * visit. Declared on the /legal page; cleared by clearLocalData().
 */

export type HistoryFilters = HistoryFilter & { sources: ApiSource[] }

const SOURCES: ApiSource[] = ['lichess', 'chesscom']

/** Anything unknown falls back to its default (everything), field by field; never an empty group. */
export function parseHistoryFilters(value: unknown): HistoryFilters {
  const saved = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof HistoryFilters, unknown>
  >
  const pick = <T>(list: unknown, allowed: T[]): T[] =>
    Array.isArray(list) ? allowed.filter((item) => list.includes(item)) : []
  const sources = pick(saved.sources, SOURCES)
  const results = pick<GameResult>(saved.results, ALL_GAMES.results)
  const categories = pick<Category>(saved.categories, CATEGORIES)
  return {
    sources: sources.length > 0 ? sources : SOURCES,
    // Every time control picked is the same as none: "All".
    categories: categories.length === CATEGORIES.length ? [] : categories,
    results: results.length > 0 ? results : ALL_GAMES.results,
  }
}

/** The platforms shown among these accounts: all of them when none of the saved ones is left. */
export function shownAccounts(accounts: HistoryAccount[], filters: HistoryFilters) {
  const shown = accounts.filter((account) => filters.sources.includes(account.source))
  return shown.length > 0 ? shown : accounts
}

const store = profileSettingsStore('craftyourchess:games-filters', 1, parseHistoryFilters)

export const loadHistoryFilters = store.load
export const saveHistoryFilters = store.save
