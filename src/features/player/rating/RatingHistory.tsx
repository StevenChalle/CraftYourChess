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
import { formatGameCount, formatNumber, formatPercent, formatSigned } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { Panel } from '../components/Panel'
import { ResultBar } from '../components/ResultBar'
import { SourceDot } from '../components/SourceBadge'
import { categoryLabel, sourceErrorMessage } from '../sources'
import { SOURCE_LABELS, type AccountSummary } from '../summary'
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
  type PeriodSummary,
} from './history'
import { ratingHistoryQueryOptions } from './queries'
import { Figure } from './Figure'
import { PeriodErrorsView } from './PeriodErrors'
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
 * The period's results under the chart: games, score, the opponents' average rating and the
 * performance, then the wins, draws and losses.
 */
function PeriodFigures({ summary }: { summary: PeriodSummary }) {
  const { games, record, opponentAverage, performance } = summary
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Figure label={m.rating_games()} value={formatNumber(games)} />
        <Figure
          label={m.rating_score()}
          value={formatPercent((record.win + record.draw / 2) / games)}
        />
        {opponentAverage !== undefined && (
          <Figure label={m.rating_opponents()} value={formatNumber(opponentAverage)} />
        )}
        {performance !== undefined && (
          <span title={m.rating_performance_hint()}>
            <Figure label={m.rating_performance()} value={formatNumber(performance)} />
          </span>
        )}
      </div>
      <ResultBar record={record} />
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
  /** joinedAt: where the lifetime starts; categories: the current ratings, in the time controls */
  accounts: Pick<AccountSummary, 'source' | 'username' | 'joinedAt' | 'categories'>[]
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
  const points = query.data?.points ?? []
  const summary = query.data?.summary
  const first = points[0]
  const last = points.at(-1)
  const peak = peakPoint(points)

  return (
    <Panel title={m.rating_chart_title()}>
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
        <div className="flex items-center gap-3">
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
            // Each with the current rating on this platform
            label={(category) => {
              const rating = account.categories[category]?.rating
              return (
                <>
                  {categoryLabel(category)}
                  {rating !== undefined && (
                    <span className="num text-muted-foreground">{formatNumber(rating)}</span>
                  )}
                </>
              )
            }}
            onChange={(category) => update({ category })}
          />
        </div>
        {/* The period's figures, on the right of the filters while there is room */}
        {first && last && peak && (
          <div className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Figure label={m.rating_current()} value={formatNumber(last.rating)}>
              {last.rating !== first.rating && (
                <span
                  title={m.rating_change()}
                  className={cn(
                    'num text-sm font-semibold',
                    last.rating > first.rating ? 'text-win' : 'text-loss',
                  )}
                >
                  {formatSigned(last.rating - first.rating)}
                </span>
              )}
            </Figure>
            <Figure label={m.rating_peak()} value={formatNumber(peak.rating)} />
          </div>
        )}
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
        <>
          {/* The period as the query saw it, when it fetched the points. */}
          <RatingChart
            points={points}
            {...periodBounds(settings.period, query.dataUpdatedAt, joinedAt)}
          />
          <div className="mt-4 border-t pt-4">
            {summary ? (
              <>
                <PeriodFigures summary={summary} />
                {query.data?.games && (
                  <PeriodErrorsView
                    games={query.data.games}
                    queryKey={[
                      'period-errors',
                      account.source,
                      account.username.toLowerCase(),
                      settings.category,
                      settings.period,
                      query.dataUpdatedAt,
                    ]}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{m.rating_summary_unavailable()}</p>
            )}
          </div>
        </>
      )}
    </Panel>
  )
}
