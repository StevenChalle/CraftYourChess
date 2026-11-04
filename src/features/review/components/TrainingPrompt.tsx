import { Play, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mistakesByGame } from '@/features/training/order'
import { DEFAULT_TRAINING_SETTINGS, toTrainingOptions } from '@/features/training/settings'
import { formatGameCount, formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'
import type { ReviewOutcome } from '../analyze'
import { useAnalysisSession } from '../sessionContext'

/**
 * Above the analysed games: the next step, training on every error of the analysis. Either right
 * away with the default options, or on the training page showing them first. Hidden without
 * errors.
 */
export function TrainingPrompt({ outcome }: { outcome: ReviewOutcome }) {
  const { trainGame, newTraining } = useAnalysisSession()
  const mistakes = outcome.games.flatMap((game) => game.mistakes)
  if (mistakes.length === 0) return null
  // What the quick training replays: the default options may leave some errors out.
  const games = mistakesByGame(
    mistakes,
    toTrainingOptions(DEFAULT_TRAINING_SETTINGS, outcome.criteria.errorMinDrop),
  )
  const positions = games.reduce((count, game) => count + game.length, 0)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 p-4">
      <div className="space-y-0.5">
        <p className="text-text-strong">{m.training_prompt_title()}</p>
        <p className="text-sm text-muted-foreground">
          {m.training_setup_recap({
            positions: m.positions_count({ count: positions, formatted: formatNumber(positions) }),
            games: formatGameCount(games.length),
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="lg" onClick={newTraining}>
          <SlidersHorizontal data-icon="inline-start" />
          {m.training_prompt_options()}
        </Button>
        <Button size="lg" disabled={positions === 0} onClick={() => trainGame(mistakes)}>
          <Play data-icon="inline-start" />
          {m.training_prompt_quick()}
        </Button>
      </div>
    </div>
  )
}
