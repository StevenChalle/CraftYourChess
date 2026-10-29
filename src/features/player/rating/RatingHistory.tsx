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
import { formatGameCount, formatNumber, formatSigned } from '@/lib/format'
import type { ApiSource } from '@/lib/http'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { Panel } from '../components/Panel'
import { SourceDot } from '../components/SourceBadge'
import { categoryLabel, sourceErrorMessage } from '../sources'
import { SOURCE_LABELS } from '../summary'
import { CHART_CATEGORIES, periodBounds, periodFromDates, type ChartCategory } from './history'
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

/**
 * The player's rating over time, on one platform and in one time control (never mixed: ratings
 * of two platforms do not compare), over a period of dates. Its filters are kept per profile in
 * this browser (settings.ts); a platform without account falls back to the other one.
 */
export function RatingHistory({
  profile,
  accounts,
}: {
  /** settings.ts's profileKey */
  profile: string
  accounts: { source: ApiSource; username: string }[]
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
      setFound,
    ),
    enabled: account !== undefined,
  })
  if (!account) return null

  const shown = periodBounds(settings.period, now)
  const from = toDateInput(shown.from)
  const to = toDateInput(shown.to)
  const today = toDateInput(now)
  const points = query.data ?? []
  const first = points[0]
  const last = points.at(-1)

  return (
    <Panel
      title={m.rating_chart_title()}
      aside={
        last &&
        first && (
          <span className="num inline-flex items-baseline gap-2">
            <span className="text-sm font-medium text-text-strong">
              {formatNumber(last.rating)}
            </span>
            {last.rating !== first.rating && (
              <span className={cn(last.rating > first.rating ? 'text-win' : 'text-loss')}>
                {formatSigned(last.rating - first.rating)}
              </span>
            )}
          </span>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
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
        <RatingChart points={points} {...periodBounds(settings.period, query.dataUpdatedAt)} />
      )}
    </Panel>
  )
}
