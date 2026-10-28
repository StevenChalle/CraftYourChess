import type { ApiSource } from '@/lib/http'
import { profileSettingsStore } from '../profileSettings'
import { CHART_CATEGORIES, type ChartCategory, type RatingPeriod } from './history'

/**
 * The rating chart's filters, per profile and per browser (localStorage), shown again on the next
 * visit. Declared on the /legal page; cleared by clearLocalData().
 */

export type RatingChartSettings = {
  source: ApiSource
  category: ChartCategory
  period: RatingPeriod
}

export const DEFAULT_RATING_CHART: RatingChartSettings = {
  source: 'chesscom',
  category: 'blitz',
  period: { kind: 'last', days: 30 },
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function parsePeriod(value: unknown): RatingPeriod | undefined {
  const period = value as Partial<Record<string, unknown>> | null
  if (period?.kind === 'last' && Number.isInteger(period.days) && (period.days as number) >= 1) {
    return { kind: 'last', days: period.days as number }
  }
  if (
    period?.kind === 'dates' &&
    typeof period.from === 'string' &&
    typeof period.to === 'string' &&
    DATE.test(period.from) &&
    DATE.test(period.to)
  ) {
    return { kind: 'dates', from: period.from, to: period.to }
  }
  return undefined
}

/** Anything unknown falls back to its default, field by field. */
export function parseRatingChartSettings(value: unknown): RatingChartSettings {
  const saved = (value && typeof value === 'object' ? value : {}) as Partial<
    Record<keyof RatingChartSettings, unknown>
  >
  return {
    source:
      saved.source === 'lichess' || saved.source === 'chesscom'
        ? saved.source
        : DEFAULT_RATING_CHART.source,
    category: CHART_CATEGORIES.includes(saved.category as ChartCategory)
      ? (saved.category as ChartCategory)
      : DEFAULT_RATING_CHART.category,
    period: parsePeriod(saved.period) ?? DEFAULT_RATING_CHART.period,
  }
}

const store = profileSettingsStore('craftyourchess:rating-chart', 2, parseRatingChartSettings)

export const loadRatingChartSettings = store.load
export const saveRatingChartSettings = store.save
