import { Microscope, Square, Swords } from 'lucide-react'
import { useState } from 'react'
import { FeedbackNudge } from '@/components/FeedbackLink'
import { TablePagination } from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import { GamesTable } from '@/features/games/components/GamesTable'
import { sourceErrorMessage } from '@/features/player/sources'
import { formatEstimate, formatGameCount, formatNumber } from '@/lib/format'
import { pageSlice } from '@/lib/pagination'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { shallowPositions, type Mistake, type ReviewedGame, type ReviewOutcome } from '../analyze'
import { reviewedGameKey, useAnalysisSession } from '../sessionContext'
import { deepenSeconds } from '../estimate'
import { GamePanel } from './GamePanel'
import { ThemeBars } from './ThemeBars'
import { TrainingPrompt } from './TrainingPrompt'

const RESULTS_PAGE_SIZE = 20

/**
 * The analysed games, paginated, with each game's errors and a button replaying them.
 * Below them, training on all the errors (TrainingPrompt), and last the feedback link.
 */
export function ReviewResults({
  outcome,
  onTrain,
}: {
  outcome: ReviewOutcome
  onTrain: (mistakes: Mistake[]) => void
}) {
  const [page, setPage] = useState(0)
  const { games, failures } = outcome
  const { deepening, stopDeepening } = useAnalysisSession()

  return (
    <div className="min-w-0 space-y-3">
      {failures.map(({ source, error }) => (
        <p key={source} className="text-sm text-loss">
          {sourceErrorMessage(source, error)}
        </p>
      ))}
      {games.length === 0 ? (
        <p className="text-muted-foreground">{m.review_no_games()}</p>
      ) : (
        <>
          <ThemeBars mistakes={games.flatMap((game) => game.mistakes)} />
          <DeepenAll games={games} />
          <GamesTable
            games={pageSlice(games, page, RESULTS_PAGE_SIZE)}
            expandable={{
              render: (game) => <GamePanel game={game} />,
              // A single game: nothing else to look at, it opens right away.
              defaultOpen: games.length === 1 ? reviewedGameKey(games[0]!) : undefined,
              // Closing a game stops deepening it (not when every game is being deepened).
              onToggle: (key, open) => {
                if (!open && deepening?.scope === 'game' && deepening.gameKey === key) {
                  stopDeepening()
                }
              },
            }}
            extra={{
              header: m.review_col_errors(),
              cell: (game: ReviewedGame) => (
                <span className="inline-flex items-center justify-end gap-2">
                  <span
                    className={cn(
                      'num text-base font-medium',
                      game.mistakes.length === 0 ? 'text-win' : 'text-loss',
                    )}
                  >
                    {formatNumber(game.mistakes.length)}
                  </span>
                  <Button
                    size="xs"
                    disabled={game.mistakes.length === 0}
                    onClick={() => onTrain(game.mistakes)}
                    title={m.replay_game()}
                  >
                    <Swords data-icon="inline-start" />
                    <span className="max-sm:sr-only">{m.replay_game_short()}</span>
                  </Button>
                </span>
              ),
            }}
          />
          <TablePagination
            page={page}
            pageSize={RESULTS_PAGE_SIZE}
            total={games.length}
            onPageChange={setPage}
          />
          <TrainingPrompt outcome={outcome} />
        </>
      )}
      {games.length > 0 && <FeedbackNudge text={m.feedback_nudge_results()} />}
    </div>
  )
}

/**
 * Above the games, discreet: deepen every game that only had a quick look, one after the other,
 * or follow and stop it. Hidden once every game is deep.
 */
function DeepenAll({ games }: { games: ReviewedGame[] }) {
  const { deepening, deepenGames, stopDeepening } = useAnalysisSession()
  if (deepening?.scope === 'all') {
    return (
      <p className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {m.deepen_all_running({
          games: formatGameCount(deepening.gamesLeft + 1),
          done: formatNumber(deepening.done),
          total: formatNumber(deepening.total),
        })}
        <Button variant="ghost" size="xs" onClick={stopDeepening} className="text-muted-foreground">
          <Square data-icon="inline-start" />
          {m.deepen_stop()}
        </Button>
      </p>
    )
  }
  const pending = games.filter((game) => shallowPositions(game).length > 0)
  if (pending.length === 0) return null
  const positions = pending.reduce((sum, game) => sum + shallowPositions(game).length, 0)
  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="xs"
        onClick={() => deepenGames(pending.map(reviewedGameKey), 'all')}
        className="text-muted-foreground"
        title={m.deepen_hint()}
      >
        <Microscope data-icon="inline-start" />
        {m.deepen_all({
          games: formatGameCount(pending.length),
          time: formatEstimate(deepenSeconds(positions)),
        })}
      </Button>
    </div>
  )
}
