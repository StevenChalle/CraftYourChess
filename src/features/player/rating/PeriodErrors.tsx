import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Mistake } from '@/features/review/analyze'
import type { ReviewGame } from '@/features/review/games'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { THEME_LABELS } from '@/features/review/themeLabels'
import { formatNumber, formatTenths } from '@/lib/format'
import { m } from '@/paraglide/messages'
import { errorBreakdown, GAME_PHASES, periodErrors, type GamePhase } from './errors'
import { Figure } from './Figure'

const PHASE_LABELS: Record<GamePhase, () => string> = {
  opening: m.theme_opening,
  middlegame: m.phase_middlegame,
  endgame: m.phase_endgame,
}

/** A group of errors to train on: its name and how many, a click starts the training. */
function TrainButton({
  label,
  mistakes,
  onTrain,
}: {
  label: string
  mistakes: Mistake[]
  onTrain: (mistakes: Mistake[]) => void
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={mistakes.length === 0}
      onClick={() => onTrain(mistakes)}
      title={m.rating_errors_train({ count: formatNumber(mistakes.length) })}
    >
      <Swords data-icon="inline-start" />
      {label}
      <span className="num text-muted-foreground">{formatNumber(mistakes.length)}</span>
    </Button>
  )
}

/**
 * The period's errors, under its results: from its games analysed before (nothing is analysed
 * here), judged with the analysis's current rules. Errors per game, where they happen, and the
 * themes that come back most; each group trains on its errors in one click. `queryKey`: the
 * period's, as the chart fetched it.
 */
export function PeriodErrorsView({
  games,
  queryKey,
}: {
  games: ReviewGame[]
  queryKey: readonly unknown[]
}) {
  const { draft, trainMistakes } = useAnalysisSession()
  const { criteria } = draft
  const query = useQuery({
    queryKey: [...queryKey, criteria],
    queryFn: () => periodErrors(games, criteria),
  })
  if (!query.data) return null
  const { analysed, mistakes } = query.data
  const train = (list: Mistake[]) => trainMistakes(list, criteria)

  if (analysed === 0) {
    return (
      <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
        {m.rating_errors_none_analysed()}
        <Button variant="outline" size="sm" asChild>
          <Link to="/player/analysis" search={(search) => search} resetScroll={false}>
            {m.rating_errors_analyse()}
          </Link>
        </Button>
      </p>
    )
  }

  const { phases, themes } = errorBreakdown(mistakes)
  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Figure label={m.rating_errors()} value={formatTenths(mistakes.length / analysed)}>
          <span className="text-sm text-muted-foreground">{m.rating_errors_per_game()}</span>
        </Figure>
        <span className="text-xs text-muted-foreground">
          {m.rating_errors_analysed({
            analysed: formatNumber(analysed),
            games: formatNumber(games.length),
          })}
        </span>
      </div>
      {mistakes.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-etabli mr-1 w-24 text-[11px]">{m.rating_errors_where()}</span>
            {GAME_PHASES.map((phase) => (
              <TrainButton
                key={phase}
                label={PHASE_LABELS[phase]()}
                mistakes={phases[phase]}
                onTrain={train}
              />
            ))}
          </div>
          {themes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-etabli mr-1 w-24 text-[11px]">
                {m.rating_errors_recurring()}
              </span>
              {themes.map(({ theme, mistakes: list }) => (
                <TrainButton
                  key={theme}
                  label={THEME_LABELS[theme].label()}
                  mistakes={list}
                  onTrain={train}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
