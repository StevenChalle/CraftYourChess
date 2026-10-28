import type { Color } from 'chessops'
import { useId, useState, type ReactNode } from 'react'
import { CHIP_CLASS } from '@/components/chip'
import { DateField } from '@/components/DateField'
import { Expandable, ExpandableGroup } from '@/components/Expandable'
import { InfoTip } from '@/components/InfoTip'
import { LimitField } from '@/components/LimitField'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { GameResult } from '@/features/games/normalize'
import { SourceDot } from '@/features/player/components/SourceBadge'
import { categoryLabel, sourceLabel } from '@/features/player/sources'
import { GAME_CATEGORIES, type GameCategory, type GameSource } from '@/features/games/normalize'
import { CATEGORIES, SOURCE_LABELS } from '@/features/player/summary'
import { fromDateInput, toDateInput } from '@/lib/dateInput'
import { formatDate, formatNumber } from '@/lib/format'
import type { ApiSource } from '@/lib/http'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import {
  DEFAULT_CRITERIA,
  ERROR_RANGE,
  normalizeCriteria,
  VALID_RANGE,
  type ReviewCriteria,
} from '../criteria'
import { lichessMarkers } from '../markers'
import { ThresholdSlider } from './ThresholdSlider'
import type { ReviewAccount } from '../fetch'
import {
  ALL_COLORS,
  ALL_RATINGS,
  activeRatingFilter,
  ALL_RESULTS,
  DATE_PRESETS,
  datePresetRange,
  defaultSelection,
  DEFAULT_RANGE_MAX,
  isRatingFilterValid,
  isSelectionValid,
  LATEST_SHORTCUTS,
  RATING_CEILING,
  RATING_FLOOR,
  type DatePreset,
  type GameScope,
  type GameSelection,
  type OpponentRatingFilter,
  type RatingKind,
} from '../selection'
import { sameCriteria, sameFilters, sameScope, type ReviewSettings } from '../settings'

const PRESET_LABELS: Record<DatePreset, () => string> = {
  today: m.preset_today,
  week: m.preset_week,
  month: m.preset_month,
  '3months': m.preset_3months,
  year: m.preset_year,
}
const RATING_LABELS: Record<RatingKind, () => string> = {
  rated: m.rating_rated,
  casual: m.rating_casual,
}
const COLOR_LABELS: Record<Color, () => string> = { white: m.color_white, black: m.color_black }
const RESULT_LABELS: Record<GameResult, () => string> = {
  win: m.result_wins,
  draw: m.result_draws,
  loss: m.result_losses,
}

const SELECTED_SHORTCUT = 'bg-raised text-text-strong ring-1 ring-border-strong hover:bg-raised'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label-etabli mb-2">{title}</legend>
      {children}
    </fieldset>
  )
}

type RangeScope = Extract<GameScope, { kind: 'range' }>

function scopeSummary(scope: GameScope): string {
  if (scope.kind === 'latest') return m.setup_summary_latest({ count: formatNumber(scope.count) })
  const period = scope.preset
    ? PRESET_LABELS[scope.preset]()
    : `${formatDate(new Date(scope.from))} – ${formatDate(new Date(scope.to))}`
  return scope.max === undefined
    ? m.setup_summary_period({ period })
    : m.setup_summary_period_max({ period, max: formatNumber(scope.max) })
}

/** What the games filters leave out, or "all games". */
function gamesSummary(
  selection: GameSelection,
  sources: GameSource[],
  categories: GameCategory[],
): string {
  const parts: string[] = []
  // Only what the form shows: hidden values (the "unknown" time control of an account) do not count.
  const some = <T,>(chosen: T[], all: readonly T[], label: (item: T) => string) => {
    const shown = chosen.filter((item) => all.includes(item))
    if (shown.length < all.length) parts.push(shown.map(label).join(', '))
  }
  some(selection.sources, sources, sourceLabel)
  some(selection.ratings, ALL_RATINGS, (rating) => RATING_LABELS[rating]())
  some(selection.categories, categories, categoryLabel)
  some(selection.colors, ALL_COLORS, (color) => COLOR_LABELS[color]())
  some(selection.results, ALL_RESULTS, (result) => RESULT_LABELS[result]())
  const ratingFilter = activeRatingFilter(selection)
  if (ratingFilter) {
    parts.push(
      m.setup_summary_opponent_rating({
        min: formatNumber(ratingFilter.min),
        max: formatNumber(ratingFilter.max),
      }),
    )
  }
  return parts.length > 0 ? parts.join(' · ') : m.setup_summary_all_games()
}

/**
 * Filters and thresholds of the advanced review, controlled by the analysis session (they survive
 * tab switches). The filters tab looks for the matching games after every change.
 */
export function ReviewSetup({
  accounts,
  sources,
  gameTotal,
  value: { selection, criteria },
  onChange,
  reference,
}: {
  accounts: ReviewAccount[]
  /** The games' origins: the accounts', or imported games (no platform, rated or not to pick) */
  sources: GameSource[]
  /** Games played on all the accounts, from the profiles (an indication) */
  gameTotal: number
  value: ReviewSettings
  onChange: (settings: ReviewSettings) => void
  /** The current analysis's settings, if any: each section can go back to them */
  reference?: ReviewSettings
}) {
  const update = (change: Partial<GameSelection>) =>
    onChange({ selection: { ...selection, ...change }, criteria })
  const setCriteria = (next: ReviewCriteria) => onChange({ selection, criteria: next })
  const sectionReset = (
    same: (ref: ReviewSettings) => boolean,
    restore: (ref: ReviewSettings) => void,
  ) => reference && { disabled: same(reference), onClick: () => restore(reference) }

  const { scope } = selection
  const valid = isSelectionValid(selection)
  const defaults = defaultSelection(sources)
  const imported = sources.includes('import')
  // "Unknown" only exists for imported games.
  const categories = imported ? GAME_CATEGORIES : CATEGORIES
  // Both ways of choosing games stay visible: the inactive one keeps its last values, dimmed,
  // and using it makes it the active one.
  const [lastLatest, setLastLatest] = useState(scope.kind === 'latest' ? scope.count : 10)
  const [lastRange, setLastRange] = useState<RangeScope>(() =>
    scope.kind === 'range'
      ? scope
      : {
          kind: 'range',
          preset: 'month',
          ...datePresetRange('month', Date.now()),
        },
  )
  const latest = scope.kind === 'latest' ? scope.count : lastLatest
  const range = scope.kind === 'range' ? scope : lastRange
  const setLatest = (count: number) => {
    setLastLatest(count)
    update({ scope: { kind: 'latest', count } })
  }
  const setRange = (next: RangeScope) => {
    setLastRange(next)
    update({ scope: next })
  }

  return (
    <div className="space-y-3">
      <ExpandableGroup defaultValue="range">
        <Expandable
          value="range"
          title={m.setup_section_range()}
          summary={scopeSummary(scope)}
          defaults={{
            disabled: sameScope(scope, defaults.scope),
            onClick: () => update({ scope: defaults.scope }),
          }}
          reset={sectionReset(
            (ref) => sameScope(scope, ref.selection.scope),
            (ref) => update({ scope: ref.selection.scope }),
          )}
        >
          <RadioGroup
            value={scope.kind}
            onValueChange={(kind) => (kind === 'latest' ? setLatest(latest) : setRange(range))}
            className="grid gap-6 md:grid-cols-2"
          >
            <div className="space-y-3">
              <RadioField value="latest">{m.setup_latest()}</RadioField>
              <div
                className={cn(
                  'space-y-3 pl-6 transition-opacity',
                  scope.kind !== 'latest' && 'opacity-50',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={gameTotal > 0 ? gameTotal : undefined}
                    value={Number.isNaN(latest) ? '' : latest}
                    onChange={(event) => setLatest(event.target.valueAsNumber)}
                    aria-label={m.setup_latest()}
                    className="num h-8 w-24 bg-muted"
                  />
                  {gameTotal > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {m.setup_latest_total({ total: formatNumber(gameTotal) })}
                    </span>
                  )}
                  {gameTotal > 0 && accounts.some((account) => account.source === 'chesscom') && (
                    <InfoTip text={m.chesscom_rated_only()} />
                  )}
                </div>
                <div className="flex gap-1">
                  {LATEST_SHORTCUTS.map((count) => (
                    <Button
                      key={count}
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={scope.kind === 'latest' && latest === count}
                      className={cn(
                        scope.kind === 'latest' && latest === count && SELECTED_SHORTCUT,
                      )}
                      onClick={() => setLatest(count)}
                    >
                      {count}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <RadioField value="range">{m.setup_period()}</RadioField>
              <div
                className={cn(
                  'space-y-3 pl-6 transition-opacity',
                  scope.kind !== 'range' && 'opacity-50',
                )}
              >
                <div className="flex flex-wrap gap-1">
                  {DATE_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant="ghost"
                      size="xs"
                      aria-pressed={scope.kind === 'range' && range.preset === preset}
                      className={cn(
                        scope.kind === 'range' && range.preset === preset && SELECTED_SHORTCUT,
                      )}
                      onClick={() =>
                        setRange({
                          kind: 'range',
                          preset,
                          ...datePresetRange(preset, Date.now()),
                          max: range.max,
                        })
                      }
                    >
                      {PRESET_LABELS[preset]()}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <DateField
                    label={m.setup_from()}
                    value={toDateInput(range.from)}
                    onChange={(value) => {
                      const from = fromDateInput(value, false)
                      if (from !== undefined) {
                        setRange({ kind: 'range', from, to: range.to, max: range.max })
                      }
                    }}
                  />
                  <DateField
                    label={m.setup_to()}
                    value={toDateInput(range.to)}
                    onChange={(value) => {
                      const to = fromDateInput(value, true)
                      if (to !== undefined) {
                        setRange({ kind: 'range', from: range.from, to, max: range.max })
                      }
                    }}
                  />
                  {!range.preset && (
                    <span className="text-xs text-muted-foreground">{m.preset_custom()}</span>
                  )}
                </div>
                <RangeMaxField value={range.max} onChange={(max) => setRange({ ...range, max })} />
              </div>
            </div>
          </RadioGroup>
        </Expandable>

        <Expandable
          value="games"
          title={m.setup_games()}
          summary={gamesSummary(selection, sources, categories)}
          defaults={{
            disabled: sameFilters(selection, defaults),
            onClick: () => update({ ...defaults, scope }),
          }}
          reset={sectionReset(
            (ref) => sameFilters(selection, ref.selection),
            (ref) => update({ ...ref.selection, scope }),
          )}
        >
          <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)]">
            {!imported && (
              <Section title={m.setup_platforms()}>
                <ToggleGroup
                  type="multiple"
                  value={selection.sources}
                  onValueChange={(value) => update({ sources: value as ApiSource[] })}
                  className="flex-wrap"
                >
                  {accounts.map(({ source, username }) => (
                    <ToggleGroupItem key={source} value={source} size="sm" className={CHIP_CLASS}>
                      <SourceDot source={source} />
                      {SOURCE_LABELS[source]}
                      <span className="text-muted-foreground">{username}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Section>
            )}

            {/* A PGN rarely says whether a game was rated */}
            {!imported && (
              <Section title={m.setup_ratings()}>
                <ToggleGroup
                  type="multiple"
                  value={selection.ratings}
                  onValueChange={(value) => update({ ratings: value as RatingKind[] })}
                  className="flex-wrap"
                >
                  {ALL_RATINGS.map((rating) => (
                    <ToggleGroupItem key={rating} value={rating} size="sm" className={CHIP_CLASS}>
                      {RATING_LABELS[rating]()}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Section>
            )}

            <Section title={m.setup_time_controls()}>
              <ToggleGroup
                type="multiple"
                value={selection.categories}
                // The hidden categories stay as they are.
                onValueChange={(value) =>
                  update({
                    categories: [
                      ...(value as GameCategory[]),
                      ...selection.categories.filter((item) => !categories.includes(item)),
                    ],
                  })
                }
                className="flex-wrap"
              >
                {categories.map((category) => (
                  <ToggleGroupItem key={category} value={category} size="sm" className={CHIP_CLASS}>
                    {categoryLabel(category)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Section>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Section title={m.setup_color()}>
              <ToggleGroup
                type="multiple"
                value={selection.colors}
                onValueChange={(value) => update({ colors: value as Color[] })}
              >
                {ALL_COLORS.map((color) => (
                  <ToggleGroupItem key={color} value={color} size="sm" className={CHIP_CLASS}>
                    {COLOR_LABELS[color]()}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Section>
            <Section title={m.setup_result()}>
              <ToggleGroup
                type="multiple"
                value={selection.results}
                onValueChange={(value) => update({ results: value as GameResult[] })}
                className="flex-wrap"
              >
                {ALL_RESULTS.map((result) => (
                  <ToggleGroupItem key={result} value={result} size="sm" className={CHIP_CLASS}>
                    {RESULT_LABELS[result]()}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Section>
            <Section title={m.setup_opponent_rating()}>
              <RatingRangeField
                filter={selection.opponentRating}
                available={selection.ratings.includes('rated')}
                onChange={(opponentRating) => update({ opponentRating })}
              />
            </Section>
          </div>
        </Expandable>

        <Expandable
          value="training"
          title={m.setup_section_training()}
          defaults={{
            disabled: sameCriteria(criteria, DEFAULT_CRITERIA),
            onClick: () => setCriteria(DEFAULT_CRITERIA),
          }}
          reset={sectionReset(
            (ref) => sameCriteria(criteria, ref.criteria),
            (ref) => setCriteria(ref.criteria),
          )}
          summary={m.setup_summary_training({
            error: String(criteria.errorMinDrop),
            valid: String(criteria.validMaxDrop),
          })}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <ThresholdSlider
              label={m.setup_error()}
              hint={m.setup_error_hint({ value: String(criteria.errorMinDrop) })}
              value={criteria.errorMinDrop}
              range={ERROR_RANGE}
              markers={lichessMarkers()}
              note={m.setup_markers_note()}
              onChange={(errorMinDrop) =>
                setCriteria(normalizeCriteria({ ...criteria, errorMinDrop }, 'errorMinDrop'))
              }
            />
            <ThresholdSlider
              label={m.setup_valid()}
              hint={m.setup_valid_hint({ value: String(criteria.validMaxDrop) })}
              value={criteria.validMaxDrop}
              range={VALID_RANGE}
              markers={lichessMarkers()}
              note={m.setup_valid_info()}
              onChange={(validMaxDrop) =>
                setCriteria(normalizeCriteria({ ...criteria, validMaxDrop }, 'validMaxDrop'))
              }
            />
          </div>
        </Expandable>
      </ExpandableGroup>

      {!valid && (
        <p className="text-sm text-loss">
          {activeRatingFilter(selection) && !isRatingFilterValid(selection.opponentRating)
            ? m.setup_invalid_rating({
                floor: formatNumber(RATING_FLOOR),
                ceiling: formatNumber(RATING_CEILING),
              })
            : m.setup_invalid()}
        </p>
      )}
    </div>
  )
}

/** The period's maximum: unchecked means no limit (see LimitField). The latest games come first. */
function RangeMaxField({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (max: number | undefined) => void
}) {
  const [last, setLast] = useState(value ?? DEFAULT_RANGE_MAX)
  return (
    <LimitField
      label={m.setup_range_max()}
      unit={m.setup_range_max_unit()}
      info={m.setup_range_max_info()}
      limited={value !== undefined}
      count={value ?? last}
      onChange={({ limited, count }) => {
        setLast(count)
        onChange(limited ? count : undefined)
      }}
    />
  )
}

function RadioField({ value, children }: { value: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem id={id} value={value} className="border-border-strong" />
      <Label htmlFor={id} className="font-normal">
        {children}
      </Label>
    </div>
  )
}

/**
 * "Between [min] and [max]", behind a checkbox (off: every opponent). Only for rated games: the
 * fields stay shown, dimmed, otherwise. Typing a bound turns the filter on.
 */
function RatingRangeField({
  filter,
  available,
  onChange,
}: {
  filter: OpponentRatingFilter
  available: boolean
  onChange: (filter: OpponentRatingFilter) => void
}) {
  const id = useId()
  const on = available && filter.enabled
  const bound = (key: 'min' | 'max', label: string) => (
    <Input
      type="number"
      min={RATING_FLOOR}
      max={RATING_CEILING}
      step={50}
      value={Number.isNaN(filter[key]) ? '' : filter[key]}
      disabled={!available}
      onChange={(event) =>
        onChange({ ...filter, enabled: true, [key]: event.target.valueAsNumber })
      }
      aria-label={label}
      className={cn('num h-8 w-20 bg-muted', !on && 'opacity-50')}
    />
  )
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Checkbox
          id={id}
          checked={on}
          disabled={!available}
          onCheckedChange={(checked) => onChange({ ...filter, enabled: checked === true })}
          className="border-border-strong"
        />
        <Label htmlFor={id} className="font-normal text-muted-foreground">
          {m.setup_rating_between()}
        </Label>
        {bound('min', m.setup_rating_min())}
        <span className="text-muted-foreground">{m.setup_rating_and()}</span>
        {bound('max', m.setup_rating_max())}
        <InfoTip text={m.setup_opponent_rating_hint()} />
      </div>
      {!available && (
        <p className="text-xs text-muted-foreground">{m.setup_opponent_rating_rated_only()}</p>
      )}
    </div>
  )
}
