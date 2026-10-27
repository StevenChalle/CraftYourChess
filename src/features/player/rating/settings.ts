import type { ApiSource } from '@/lib/http'
import { CATEGORIES, type Category } from '../summary'
import { RATING_RANGES, type RatingRange } from './history'

/**
 * The rating chart's filters, per browser (localStorage), shown again next time. Declared on the
 * /legal page; cleared by clearLocalData().
 */

const STORAGE_KEY = 'craftyourchess:rating-chart'

export type RatingChartSettings = { source: ApiSource; category: Category; range: RatingRange }

export const DEFAULT_RATING_CHART: RatingChartSettings = {
  source: 'chesscom',
  category: 'blitz',
  range: '30d',
}

/** Anything unknown falls back to its default, field by field. */
export function parseRatingChartSettings(raw: string | null): RatingChartSettings {
  let saved: Partial<Record<keyof RatingChartSettings, unknown>> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') saved = parsed
  } catch {
    // Unreadable: defaults
  }
  return {
    source:
      saved.source === 'lichess' || saved.source === 'chesscom'
        ? saved.source
        : DEFAULT_RATING_CHART.source,
    category: CATEGORIES.includes(saved.category as Category)
      ? (saved.category as Category)
      : DEFAULT_RATING_CHART.category,
    range: RATING_RANGES.includes(saved.range as RatingRange)
      ? (saved.range as RatingRange)
      : DEFAULT_RATING_CHART.range,
  }
}

export function loadRatingChartSettings(): RatingChartSettings {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode, blocked site data): defaults
  }
  return parseRatingChartSettings(raw)
}

export function saveRatingChartSettings(settings: RatingChartSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Not saved: the filters still apply until the page closes
  }
}
