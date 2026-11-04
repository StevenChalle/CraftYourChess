import { Microscope, Square } from 'lucide-react'
import { useState } from 'react'
import { FeedbackNudge } from '@/components/FeedbackLink'
import { TablePagination } from '@/components/TablePagination'
import { Button } from '@/components/ui/button'
import { AnalyzeLink } from '@/features/games/components/AnalyzeLink'
import { GamesTable } from '@/features/games/components/GamesTable'
import { MistakesCount } from '@/features/games/components/MistakesCount'
import { sourceErrorMessage } from '@/features/player/sources'
import { formatEstimate, formatGameCount, formatNumber } from '@/lib/format'
import { pageSlice } from '@/lib/pagination'
import { loadPageSize, PAGE_SIZES, savePageSize } from '@/features/games/pageSize'
import { m } from '@/paraglide/messages'
import { shallowPositions, type Mistake, type ReviewedGame, type ReviewOutcome } from '../analyze'
import { reviewedGameKey, useAnalysisSession } from '../sessionContext'
import { deepenSeconds } from '../estimate'
import { ReviewLink } from '@/features/study/components/ReviewLink'
import { GamePanel } from './GamePanel'
import { ThemeBars } from './ThemeBars'
import { TrainingPrompt } from './TrainingPrompt'

/**
 * The analysed games, paginated, with each game's errors and a button replaying them. Above them,
 * training on all the errors (TrainingPrompt); last, the feedback link.
 */
export function ReviewResults({
  outcome,
  onTrain,
}: {
  outcome: ReviewOutcome
  onTrain: (mistakes: Mistake[]) => void
}) {
  const [pageSize, setPageSize] = useState(loadPageSize)
  const { games, failures } = outcome
  // The page and the game open are kept with the analysis: back from a training, as they were.
  const { deepening, stopDeepening, analysisView, updateAnalysisView } = useAnalysisSession()
  const page = analysisView?.page ?? 0
  const setPage = (next: number) => updateAnalysisView({ page: next })

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
          <TrainingPrompt outcome={outcome} />
          <DeepenAll games={games} />
          {/* The same list as the profile's: its box, its columns, its actions. */}
          <div className="panel-etabli px-2">
            <GamesTable
              games={pageSlice(games, page, pageSize)}
              action={(game) => (
                <>
                  <ReviewLink game={game} compact />
                  <AnalyzeLink
                    analysed
                    compact
                    disabled={game.mistakes.length === 0}
                    onTrain={() => onTrain(game.mistakes)}
                  />
                </>
              )}
              expandable={{
                render: (game) => (
                  <GamePanel
                    game={game}
                    train={
                      <AnalyzeLink
                        analysed
                        size="sm"
                        disabled={game.mistakes.length === 0}
                        onTrain={() => onTrain(game.mistakes)}
                      />
                    }
                  />
                ),
                // A single game: nothing else to look at, it opens right away.
                defaultOpen:
                  analysisView?.open ??
                  (games.length === 1 ? reviewedGameKey(games[0]!) : undefined),
                // Closing a game stops deepening it (not when every game is being deepened).
                onToggle: (key, open) => {
                  if (open) updateAnalysisView({ open: key })
                  else if (analysisView?.open === key) updateAnalysisView({ open: undefined })
                  if (!open && deepening?.scope === 'game' && deepening.gameKey === key) {
                    stopDeepening()
                  }
                },
              }}
              extra={{
                header: m.review_col_errors(),
                cell: (game: ReviewedGame) => <MistakesCount count={game.mistakes.length} />,
              }}
            />
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={games.length}
            onPageChange={setPage}
            pageSizes={PAGE_SIZES}
            onPageSizeChange={(size) => {
              setPage(Math.floor((page * pageSize) / size))
              setPageSize(size)
              savePageSize(size)
            }}
          />
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
        {deepening.paused && <span>{m.deepen_paused()}</span>}
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
