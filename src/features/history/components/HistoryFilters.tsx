import type { ReactNode } from 'react'
import { CHIP_CLASS } from '@/components/chip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { GameResult } from '@/features/games/normalize'
import { SourceDot } from '@/features/player/components/SourceBadge'
import { categoryLabel } from '@/features/player/sources'
import { CATEGORIES, SOURCE_LABELS, type Category } from '@/features/player/summary'
import type { ApiSource } from '@/lib/http'
import { m } from '@/paraglide/messages'
import type { HistoryAccount } from '../feed'
import type { HistoryFilters } from '../filters'

const RESULTS: GameResult[] = ['win', 'draw', 'loss']

const RESULT_LABELS: Record<GameResult, () => string> = {
  win: m.result_wins,
  draw: m.result_draws,
  loss: m.result_losses,
}

/** The "all time controls" chip: no category picked. */
const ALL = 'all'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="label-etabli mb-1.5">{title}</legend>
      {children}
    </fieldset>
  )
}

/**
 * The Games tab's filters, simpler than the analysis's: platforms (with two accounts), time
 * controls ("All" by default) and results. A group never ends up empty: unticking its last chip
 * does nothing, or brings back "All" for the time controls.
 */
export function HistoryFiltersBar({
  accounts,
  filters,
  onChange,
}: {
  accounts: HistoryAccount[]
  /** With the platforms shown (filters.ts's shownAccounts) */
  filters: HistoryFilters
  onChange: (filters: HistoryFilters) => void
}) {
  const update = (patch: Partial<HistoryFilters>) => onChange({ ...filters, ...patch })

  const pickCategories = (value: string[]) => {
    // "All" just picked, or nothing left, or every category: back to all of them.
    const all =
      (value.includes(ALL) && filters.categories.length > 0) ||
      value.length === 0 ||
      value.filter((item) => item !== ALL).length === CATEGORIES.length
    update({ categories: all ? [] : (value.filter((item) => item !== ALL) as Category[]) })
  }

  // Its groups only: they wrap in the caller's row, beside its buttons.
  return (
    <>
      {accounts.length > 1 && (
        <Group title={m.setup_platforms()}>
          <ToggleGroup
            type="multiple"
            value={filters.sources}
            onValueChange={(value) => value.length > 0 && update({ sources: value as ApiSource[] })}
            className="flex-wrap"
          >
            {accounts.map(({ source }) => (
              <ToggleGroupItem key={source} value={source} size="sm" className={CHIP_CLASS}>
                <SourceDot source={source} />
                {SOURCE_LABELS[source]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Group>
      )}
      <Group title={m.setup_time_controls()}>
        <ToggleGroup
          type="multiple"
          value={filters.categories.length > 0 ? filters.categories : [ALL]}
          onValueChange={pickCategories}
          className="flex-wrap"
        >
          <ToggleGroupItem value={ALL} size="sm" className={CHIP_CLASS}>
            {m.history_filter_all()}
          </ToggleGroupItem>
          {CATEGORIES.map((category) => (
            <ToggleGroupItem key={category} value={category} size="sm" className={CHIP_CLASS}>
              {categoryLabel(category)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>
      <Group title={m.setup_result()}>
        <ToggleGroup
          type="multiple"
          value={filters.results}
          onValueChange={(value) => value.length > 0 && update({ results: value as GameResult[] })}
          className="flex-wrap"
        >
          {RESULTS.map((result) => (
            <ToggleGroupItem key={result} value={result} size="sm" className={CHIP_CLASS}>
              {RESULT_LABELS[result]()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>
    </>
  )
}
