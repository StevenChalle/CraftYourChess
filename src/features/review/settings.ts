import type { Color } from 'chessops'
import type { GameResult } from '@/features/games/normalize'
import { CATEGORIES, type Category } from '@/features/player/summary'
import { detectDevice } from '@/lib/device'
import type { ApiSource } from '@/lib/http'
import { DEFAULT_CRITERIA, normalizeCriteria, type ReviewCriteria } from './criteria'
import {
  activeRatingFilter,
  ALL_COLORS,
  ALL_RATINGS,
  ALL_RESULTS,
  DATE_PRESETS,
  defaultSelection,
  isRatingFilterValid,
  type GameScope,
  type GameSelection,
  type OpponentRatingFilter,
  type RatingKind,
} from './selection'

/**
 * The advanced review's last settings, per browser (localStorage), to start from next time.
 * Declared on the /legal page; cleared by clearLocalData().
 */

const STORAGE_KEY = 'craftyourchess:review-settings'
const VERSION = 1

export type ReviewSettings = {
  selection: GameSelection
  criteria: ReviewCriteria
  /**
   * Once the analysis is done, every position of its games the engine only looked at quickly gets
   * a deep look, in the background. Not a filter: changing it alone does not make a new analysis.
   */
  autoDeepen: boolean
}

/** On by default on a computer; on a phone, minutes of Stockfish weigh on the battery. */
export function defaultAutoDeepen(): boolean {
  return detectDevice() === 'desktop'
}

const SOURCES: ApiSource[] = ['lichess', 'chesscom']

function pick<T>(value: unknown, allowed: readonly T[]): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  const kept = allowed.filter((item) => value.includes(item))
  return kept.length > 0 ? kept : undefined
}

function parseScope(value: unknown): GameScope | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const scope = value as Record<string, unknown>
  if (scope.kind === 'latest' && Number.isInteger(scope.count) && (scope.count as number) >= 1) {
    return { kind: 'latest', count: scope.count as number }
  }
  if (scope.kind === 'range' && typeof scope.from === 'number' && typeof scope.to === 'number') {
    const preset = DATE_PRESETS.find((item) => item === scope.preset)
    const max = Number.isInteger(scope.max) && (scope.max as number) >= 1 ? scope.max : undefined
    return {
      kind: 'range',
      from: scope.from,
      to: scope.to,
      ...(preset && { preset }),
      ...(max !== undefined && { max: max as number }),
    }
  }
  return undefined
}

function parseRatingFilter(value: unknown): OpponentRatingFilter | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { enabled, min, max } = value as Record<string, unknown>
  if (typeof enabled !== 'boolean' || typeof min !== 'number' || typeof max !== 'number') {
    return undefined
  }
  const filter = { enabled, min, max }
  return isRatingFilterValid(filter) ? filter : undefined
}

/**
 * Saved settings over the defaults, field by field: anything missing or invalid falls back.
 * Platforms are limited to the accounts available now (all of them if none of the saved ones).
 */
export function parseReviewSettings(raw: string | null, available: ApiSource[]): ReviewSettings {
  const defaults = {
    selection: defaultSelection(available),
    criteria: DEFAULT_CRITERIA,
    autoDeepen: defaultAutoDeepen(),
  }
  if (!raw) return defaults
  let data: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return defaults
    data = parsed as Record<string, unknown>
  } catch {
    return defaults
  }
  if (data.version !== VERSION) return defaults

  const saved = (typeof data.selection === 'object' && data.selection) || {}
  const s = saved as Record<string, unknown>
  const sources = (pick(s.sources, SOURCES) ?? []).filter((source) => available.includes(source))
  const selection: GameSelection = {
    sources: sources.length > 0 ? sources : defaults.selection.sources,
    ratings: pick<RatingKind>(s.ratings, ALL_RATINGS) ?? defaults.selection.ratings,
    scope: parseScope(s.scope) ?? defaults.selection.scope,
    categories: pick<Category>(s.categories, CATEGORIES) ?? defaults.selection.categories,
    colors: pick<Color>(s.colors, ALL_COLORS) ?? defaults.selection.colors,
    results: pick<GameResult>(s.results, ALL_RESULTS) ?? defaults.selection.results,
    opponentRating: parseRatingFilter(s.opponentRating) ?? defaults.selection.opponentRating,
  }

  const c = (typeof data.criteria === 'object' && data.criteria) || {}
  const { errorMinDrop, validMaxDrop } = c as Record<string, unknown>
  const criteria =
    typeof errorMinDrop === 'number' && typeof validMaxDrop === 'number'
      ? normalizeCriteria({ errorMinDrop, validMaxDrop })
      : DEFAULT_CRITERIA

  const autoDeepen = typeof data.autoDeepen === 'boolean' ? data.autoDeepen : defaults.autoDeepen

  return { selection, criteria, autoDeepen }
}

export function loadReviewSettings(available: ApiSource[]): ReviewSettings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode, blocked site data): defaults
  }
  return parseReviewSettings(raw, available)
}

export function saveReviewSettings(settings: ReviewSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, ...settings }))
  } catch {
    // Not saved: the settings still apply to this review
  }
}

const sameItems = <T>(a: T[], b: T[]) =>
  a.length === b.length && a.every((item) => b.includes(item))

export function sameScope(x: GameScope, y: GameScope): boolean {
  return x.kind === 'latest' && y.kind === 'latest'
    ? x.count === y.count
    : x.kind === 'range' && y.kind === 'range'
      ? x.from === y.from && x.to === y.to && x.preset === y.preset && x.max === y.max
      : false
}

/** Same games filters, whatever the scope (order of the chosen items does not matter). */
export function sameFilters(x: GameSelection, y: GameSelection): boolean {
  return (
    sameItems(x.sources, y.sources) &&
    sameItems(x.ratings, y.ratings) &&
    sameItems(x.categories, y.categories) &&
    sameItems(x.colors, y.colors) &&
    sameItems(x.results, y.results) &&
    sameRatingFilter(activeRatingFilter(x), activeRatingFilter(y))
  )
}

/** Two rating filters in force (undefined: none) keep the same games. */
function sameRatingFilter(x?: OpponentRatingFilter, y?: OpponentRatingFilter): boolean {
  return x === undefined || y === undefined ? x === y : x.min === y.min && x.max === y.max
}

/** Same games: same scope and same filters. */
export function sameSelection(x: GameSelection, y: GameSelection): boolean {
  return sameScope(x.scope, y.scope) && sameFilters(x, y)
}

export function sameCriteria(a: ReviewCriteria, b: ReviewCriteria): boolean {
  return a.errorMinDrop === b.errorMinDrop && a.validMaxDrop === b.validMaxDrop
}

/** Same games and same rules. */
export function sameSettings(a: ReviewSettings, b: ReviewSettings): boolean {
  return sameSelection(a.selection, b.selection) && sameCriteria(a.criteria, b.criteria)
}
