import { Check, Gauge, Microscope, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useBackground } from '@/features/background/backgroundContext'
import { SideSquare } from '@/features/games/components/GamesTable'
import { SourceLabel } from '@/features/player/components/SourceBadge'
import { formatDate, formatDuration, formatNumber, formatTime } from '@/lib/format'
import { m } from '@/paraglide/messages'
import { shallowPositions, type ReviewedGame } from '../analyze'
import { movesHash } from '../cache'
import { deepenSeconds } from '../estimate'
import { reviewedGameKey, useAnalysisSession } from '../sessionContext'
import { EvalChart } from './EvalChart'

/**
 * An analysed game, opened in the results: the columns hidden on a phone, the evaluation chart,
 * whether every move had a deep look (on the legend's line), and deepening the positions that only
 * had a quick look, or its progress. `deepen`: false outside the analysis's results (a game of the
 * profile, judged from the cache), where the session cannot deepen it: only the progress of a
 * deepening under way (the Results tab's, or the background analysis's). `ratingChange`: for the
 * chart's summary of the game, when known (Lichess says it itself).
 */
export function GamePanel({
  game,
  deepen = true,
  ratingChange,
}: {
  game: ReviewedGame
  deepen?: boolean
  ratingChange?: number
}) {
  const { deepening, stopDeepening } = useAnalysisSession()
  const background = useBackground()?.state
  const running = deepening?.gameKey === reviewedGameKey(game) ? deepening : undefined
  const inBackground =
    !running &&
    background?.phase === 'deepening' &&
    background.deepening?.includes(movesHash(game.sanMoves, game.initialFen))
  const shallow = shallowPositions(game).length
  const busy = running !== undefined || inBackground

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:hidden">
        {!game.undated && (
          <span className="num text-muted-foreground">
            {formatDate(game.playedAt)} {formatTime(game.playedAt)}
          </span>
        )}
        <SourceLabel source={game.source} />
        <span className="inline-flex items-center gap-2">
          <SideSquare color={game.color} />
          <span className="text-text-strong">{game.opponent.name}</span>
          {game.opponent.rating !== undefined && (
            <span className="num text-muted-foreground">{game.opponent.rating}</span>
          )}
        </span>
      </p>
      <EvalChart
        game={game}
        ratingChange={ratingChange ?? game.ratingDiff}
        legendAside={
          busy ? undefined : shallow === 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="size-3.5 text-win" />
              {m.deepen_done()}
            </span>
          ) : (
            !deepen && (
              <span className="inline-flex items-center gap-1.5">
                <Gauge className="size-3.5" />
                {m.deepen_quick()}
              </span>
            )
          )
        }
      />
      {running ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <p className="text-xs text-muted-foreground tabular-nums">
              {m.deepen_running({
                done: formatNumber(running.done),
                total: formatNumber(running.total),
              })}
              {running.paused && <> · {m.deepen_paused()}</>}
            </p>
            <Progress value={(running.done / running.total) * 100} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={stopDeepening}
            className="text-muted-foreground"
          >
            <Square data-icon="inline-start" />
            {m.deepen_stop()}
          </Button>
        </div>
      ) : inBackground ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{m.deepen_background()}</p>
          <Progress value={((background.current ?? 0) / background.deepening!.length) * 100} />
        </div>
      ) : (
        deepen && shallow > 0 && <DeepenButton game={game} shallow={shallow} />
      )}
    </div>
  )
}

/** "Deepen the analysis (≈ 1 min)", with what it does. */
function DeepenButton({ game, shallow }: { game: ReviewedGame; shallow: number }) {
  const { deepening, deepenGames, analysis } = useAnalysisSession()
  const key = reviewedGameKey(game)

  // While every game is being deepened: this one first, then the others still to do.
  const deepenThis = () => {
    if (deepening?.scope !== 'all' || analysis.status !== 'done') return deepenGames([key], 'game')
    const others = analysis.outcome.games
      .filter((item) => reviewedGameKey(item) !== key && shallowPositions(item).length > 0)
      .map(reviewedGameKey)
    deepenGames([key, ...others], 'all')
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button variant="outline" size="sm" onClick={deepenThis}>
        <Microscope data-icon="inline-start" />
        {m.deepen_game({ time: formatDuration(deepenSeconds(shallow)) })}
      </Button>
      <span className="text-xs text-muted-foreground">{m.deepen_hint()}</span>
    </div>
  )
}
