import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { CHIP_CLASS } from '@/components/chip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatGameCount, formatNumber, formatSigned } from '@/lib/format'
import type { ApiSource } from '@/lib/http'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { Panel } from '../components/Panel'
import { SourceDot } from '../components/SourceBadge'
import { categoryLabel, sourceErrorMessage } from '../sources'
import { CATEGORIES, SOURCE_LABELS, type Category } from '../summary'
import { RATING_RANGES, rangeStart, type RatingRange } from './history'
import { ratingHistoryQueryOptions } from './queries'
import { RatingChart } from './RatingChart'
import {
  loadRatingChartSettings,
  saveRatingChartSettings,
  type RatingChartSettings,
} from './settings'

const RANGE_LABELS: Record<RatingRange, () => string> = {
  '7d': m.rating_range_week,
  '30d': m.rating_range_month,
  '90d': m.rating_range_3months,
  '365d': m.rating_range_year,
}

/** One choice among a few chips: clicking the chosen one keeps it. */
function Choice<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T
  options: T[]
  label: (option: T) => ReactNode
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as T)}
      className="flex-wrap"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option} size="sm" className={CHIP_CLASS}>
          {label(option)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The player's rating over time, on one platform and in one time control (never mixed: ratings
 * of two platforms do not compare). Its filters are kept in this browser (settings.ts); a platform
 * without account falls back to the other one.
 */
export function RatingHistory({
  accounts,
}: {
  accounts: { source: ApiSource; username: string }[]
}) {
  const [settings, setSettings] = useState(loadRatingChartSettings)
  /** Games downloaded so far, when the points come from the games */
  const [found, setFound] = useState(0)
  const update = (patch: Partial<RatingChartSettings>) => {
    const next = { ...settings, ...patch }
    saveRatingChartSettings(next)
    setSettings(next)
    setFound(0)
  }
  const account = accounts.find((item) => item.source === settings.source) ?? accounts[0]
  const query = useQuery({
    ...ratingHistoryQueryOptions(
      account?.source ?? 'chesscom',
      account?.username ?? '',
      settings.category,
      settings.range,
      setFound,
    ),
    enabled: account !== undefined,
  })
  if (!account) return null

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
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-3">
        {accounts.length > 1 && (
          <Choice
            value={account.source}
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
        <Choice<Category>
          value={settings.category}
          options={CATEGORIES}
          label={categoryLabel}
          onChange={(category) => update({ category })}
        />
        <Choice<RatingRange>
          value={settings.range}
          options={RATING_RANGES}
          label={(range) => RANGE_LABELS[range]()}
          onChange={(range) => update({ range })}
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
        // The range as the query saw it, when it fetched the points.
        <RatingChart
          points={points}
          from={rangeStart(settings.range, query.dataUpdatedAt)}
          to={query.dataUpdatedAt}
        />
      )}
    </Panel>
  )
}
