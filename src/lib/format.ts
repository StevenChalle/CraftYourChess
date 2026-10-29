import { m } from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'

/**
 * Locale-aware formatting helpers. Formatters follow the current UI locale
 * and are cached per locale (Intl constructors are relatively expensive).
 */

function cachedPerLocale<T>(create: (locale: string) => T): () => T {
  const cache = new Map<string, T>()
  return () => {
    const locale = getLocale()
    let formatter = cache.get(locale)
    if (!formatter) {
      formatter = create(locale)
      cache.set(locale, formatter)
    }
    return formatter
  }
}

const numberFormat = cachedPerLocale((locale) => new Intl.NumberFormat(locale))
const percentFormat = cachedPerLocale(
  (locale) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
)
const monthYearFormat = cachedPerLocale(
  (locale) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
)
const dateFormat = cachedPerLocale(
  (locale) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
)
const relativeFormat = cachedPerLocale(
  (locale) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }),
)
const orList = cachedPerLocale((locale) => new Intl.ListFormat(locale, { type: 'disjunction' }))
const andList = cachedPerLocale((locale) => new Intl.ListFormat(locale, { type: 'conjunction' }))

export function formatNumber(value: number): string {
  return numberFormat().format(value)
}

/** "1 game" / "1 234 parties", with the locale's plural rules */
export function formatGameCount(count: number): string {
  return m.games_count({ count, formatted: formatNumber(count) })
}

export function formatPositionCount(count: number): string {
  return m.positions_count({ count, formatted: formatNumber(count) })
}

const tenthsFormat = cachedPerLocale(
  (locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
)

/** At most one decimal: "1.8" / "1,8", "2" */
export function formatTenths(value: number): string {
  return tenthsFormat().format(value)
}

export function formatPercent(ratio: number): string {
  return percentFormat().format(ratio)
}

export function formatMonthYear(date: Date): string {
  return monthYearFormat().format(date)
}

export function formatDate(date: Date): string {
  return dateFormat().format(date)
}

const timeFormat = cachedPerLocale(
  (locale) => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }),
)

/** Local time of day, as usual in the locale: "14:32" / "2:32 PM" */
export function formatTime(date: Date): string {
  return timeFormat().format(date)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function formatRelative(date: Date, now: Date = new Date()): string {
  const seconds = (date.getTime() - now.getTime()) / 1000
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat().format(Math.round(seconds / size), unit)
  }
  return m.just_now()
}

/** Hours, rounded: "1,234 h" / "1 234 h" */
export function formatHours(seconds: number): string {
  return `${formatNumber(Math.round(seconds / 3600))} h`
}

const secondsFormat = cachedPerLocale(
  (locale) => new Intl.NumberFormat(locale, { style: 'unit', unit: 'second' }),
)
const minutesFormat = cachedPerLocale(
  (locale) => new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute' }),
)

/** Rough remaining time: "45 sec" (by 5 s steps), then whole minutes: "3 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return secondsFormat().format(Math.max(5, Math.ceil(seconds / 5) * 5))
  return minutesFormat().format(Math.ceil(seconds / 60))
}

const hoursFormat = cachedPerLocale(
  (locale) => new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour' }),
)

/** Rough estimate, possibly long: "45 sec", "12 min", "1 hr 20 min" / "1 h 20 min". */
export function formatEstimate(seconds: number): string {
  if (seconds < 3600) return formatDuration(seconds)
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? hoursFormat().format(hours)
    : `${hoursFormat().format(hours)} ${minutesFormat().format(rest)}`
}

const signedTenthsFormat = cachedPerLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }),
)

const signedFormat = cachedPerLocale(
  (locale) => new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }),
)

/** Whole number, signed except zero: "+8", "-12", "0" */
export function formatSigned(value: number): string {
  return signedFormat().format(value)
}

const signedHundredthsFormat = cachedPerLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'exceptZero',
    }),
)

/** Two decimals, always signed except zero: "+0.32" / "+0,32", "−1.75", "0.00" */
export function formatSignedHundredths(value: number): string {
  return signedHundredthsFormat().format(value)
}

/** One decimal, always signed except zero: "+1.5" / "+1,5", "−0.3", "0.0" */
export function formatSignedTenths(value: number): string {
  return signedTenthsFormat().format(value)
}

/** "a", "a and b", "a, b, and c" */
export function formatList(items: string[]): string {
  return andList().format(items)
}

/** "a", "a or b", "a, b, or c" */
export function formatOrList(items: string[]): string {
  return orList().format(items)
}
