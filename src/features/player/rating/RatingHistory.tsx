import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { DateField } from '@/components/DateField'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toDateInput } from '@/lib/dateInput'
import { formatDate, formatGameCount, formatNumber, formatSigned } from '@/lib/format'
import type { ApiSource } from '@/lib/http'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { Panel } from '../components/Panel'
import { SourceDot } from '../components/SourceBadge'
import { categoryLabel, sourceErrorMessage } from '../sources'
import { SOURCE_LABELS } from '../summary'
import {
  CHART_CATEGORIES,
  PERIOD_PRESETS,
  periodBounds,
  periodFromDates,
  peakPoint,
  periodPreset,
  presetPeriod,
  type ChartCategory,
  type PeriodPreset,
} from './history'
import { ratingHistoryQueryOptions } from './queries'
import { RatingChart } from './RatingChart'
import {
  loadRatingChartSettings,
  saveRatingChartSettings,
  type RatingChartSettings,
} from './settings'

/** One choice in a short list, the width of its longest option. */
function Picker<T extends string>({
  value,
  options,
  label,
  ariaLabel,
  onChange,
}: {
  value: T
  options: T[]
  label: (option: T) => ReactNode
  ariaLabel: string
  onChange: (value: T) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 bg-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A figure of the period, above the chart: its label, its value, a date under it. */
function Figure({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <div>
      <div className="label-etabli text-[11px]">{label}</div>
      <div className={cn('num text-xl leading-7 font-semibold text-text-strong', className)}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

const PRESET_LABELS: Record<PeriodPreset | 'custom', () => string> = {
  today: m.rating_preset_today,
  week: m.rating_preset_week,
  month: m.rating_preset_month,
  semester: m.rating_preset_semester,
  year: m.rating_preset_year,
  lifetime: m.rating_preset_lifetime,
  custom: m.rating_preset_custom,
}

/**
 * The player's rating over time, on one platform and in one time control (never mixed: ratings
 * of two platforms do not compare), over a period: a preset, or dates. The period on the left, the
 * platform and time control on the right. Its filters are kept per profile in this browser
 * (settings.ts); a platform without account falls back to the other one.
 */
export function RatingHistory({
  profile,
  accounts,
}: {
  /** settings.ts's profileKey */
  profile: string
  /** joinedAt: where the lifetime starts */
  accounts: { source: ApiSource; username: string; joinedAt?: Date }[]
}) {
  const [settings, setSettings] = useState(() => loadRatingChartSettings(profile))
  /** Games downloaded so far, while the points load */
  const [found, setFound] = useState(0)
  // The date inputs' today: when the chart opened.
  const [now] = useState(Date.now)
  const update = (patch: Partial<RatingChartSettings>) => {
    const next = { ...settings, ...patch }
    saveRatingChartSettings(profile, next)
    setSettings(next)
    setFound(0)
  }
  const account = accounts.find((item) => item.source === settings.source) ?? accounts[0]
  const query = useQuery({
    ...ratingHistoryQueryOptions(
      account?.source ?? 'chesscom',
      account?.username ?? '',
      settings.category,
      settings.period,
      account?.joinedAt?.getTime(),
      setFound,
    ),
    enabled: account !== undefined,
  })
  if (!account) return null

  const joinedAt = account.joinedAt?.getTime()
  const shown = periodBounds(settings.period, now, joinedAt)
  const preset = periodPreset(settings.period) ?? 'custom'
  const from = toDateInput(shown.from)
  const to = toDateInput(shown.to)
  const today = toDateInput(now)
  const points = query.data ?? []
  const first = points[0]
  const last = points.at(-1)
  const peak = peakPoint(points)

  return (
    <Panel
      title={m.rating_chart_title()}
      aside={
        first &&
        last &&
        peak && (
          <div className="flex items-start gap-6 text-right">
            <Figure label={m.rating_current()} value={formatNumber(last.rating)} />
            <Figure
              label={m.rating_change()}
              value={formatSigned(last.rating - first.rating)}
              className={cn(
                last.rating > first.rating && 'text-win',
                last.rating < first.rating && 'text-loss',
              )}
            />
            <Figure
              label={m.rating_peak()}
              value={formatNumber(peak.rating)}
              hint={formatDate(new Date(peak.day))}
            />
          </div>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Picker<PeriodPreset | 'custom'>
          value={preset}
          ariaLabel={m.rating_period()}
          // "Custom" only says the dates were typed: it is never picked.
          options={preset === 'custom' ? [...PERIOD_PRESETS, 'custom'] : PERIOD_PRESETS}
          label={(option) => PRESET_LABELS[option]()}
          onChange={(option) => option !== 'custom' && update({ period: presetPeriod(option) })}
        />
        <div className="flex items-center gap-1.5 text-sm">
          <DateField
            label={m.setup_from()}
            hideLabel
            value={from}
            max={to}
            onChange={(value) =>
              value && value <= to && update({ period: periodFromDates(value, to, now) })
            }
          />
          <span aria-hidden className="text-muted-foreground">
            –
          </span>
          <DateField
            label={m.setup_to()}
            hideLabel
            value={to}
            min={from}
            max={today}
            onChange={(value) =>
              value &&
              value >= from &&
              value <= today &&
              update({ period: periodFromDates(from, value, now) })
            }
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {accounts.length > 1 && (
            <Picker
              value={account.source}
              ariaLabel={m.review_col_platform()}
              options={accounts.map((item) => item.source)}
              label={(source) => (
                <>
                  <SourceDot source={source} />
                  {SOURCE_LABELS[source]}
                </>
              )}
              onChange={(source) => update({ source })}
            />
          )}
          <Picker<ChartCategory>
            value={settings.category}
            ariaLabel={m.time_control()}
            options={CHART_CATEGORIES}
            label={categoryLabel}
            onChange={(category) => update({ category })}
          />
        </div>
      </div>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">
          {found > 0
            ? m.rating_chart_loading_games({ games: formatGameCount(found) })
            : m.loading()}
        </p>
      ) : query.isError ? (
        <p className="text-sm text-loss">{sourceErrorMessage(account.source, query.error)}</p>
      ) : points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.rating_chart_empty()}</p>
      ) : (
        // The period as the query saw it, when it fetched the points.
        <RatingChart
          points={points}
          {...periodBounds(settings.period, query.dataUpdatedAt, joinedAt)}
        />
      )}
    </Panel>
  )
}
