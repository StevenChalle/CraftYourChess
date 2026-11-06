import { Check, Gauge, Microscope, Square } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatDuration, formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'
import { shallowPositions, type ReviewedGame } from '../analyze'
import { deepenSeconds } from '../estimate'
import { gameRef } from '../gameRef'
import { reviewedGameKey, useAnalysisSession } from '../sessionContext'
import { useTracker } from '../tracker'
import { EvalChart } from './EvalChart'

/**
 * An analysed game, opened in a list: its opponent on a phone (hidden from the row), the
 * evaluation chart, whether every move had a deep look (on the legend's line), and deepening the
 * positions that only had a quick look, or its progress, whoever deepens it (the player, the
 * background analysis: tracker.ts), the errors counted again as it goes. `deepen`: true in the
 * analysis's results, whose games deepen together (a button under the chart); false in the other
 * lists (the profile), where the game deepens on its own, from the legend's line. `ratingChange`:
 * for the chart's summary of the game, when known (Lichess says it itself). `train`: the training of
 * the game's errors, beside the review page's button in the chart's details.
 */
export function GamePanel({
  game: received,
  deepen = true,
  ratingChange,
  train,
}: {
  game: ReviewedGame
  deepen?: boolean
  ratingChange?: number
  train?: ReactNode
}) {
  const { deepenGame, stopGame } = useAnalysisSession()
  const ref = gameRef(received)
  const tracked = useTracker().active.get(ref)
  // As far as its deepening went.
  const game = tracked?.review ?? received
  const shallow = shallowPositions(game).length
  const busy = tracked !== undefined

  return (
    <div className="space-y-3">
      {/* On a phone, the opponent the row hides; its date and platform would be too much */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-muted-foreground">{m.games_opponent_label()}</span>
          <span className="text-text-strong">{game.opponent.name}</span>
          {game.opponent.rating !== undefined && (
            <span className="num text-muted-foreground">{game.opponent.rating}</span>
          )}
        </span>
      </p>
      <EvalChart
        game={game}
        ratingChange={ratingChange ?? game.ratingDiff}
        train={train}
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
                <Button
                  variant="outline"
                  size="xs"
                  className="ml-1"
                  onClick={() => deepenGame(game)}
                  title={m.deepen_hint()}
                >
                  <Microscope data-icon="inline-start" />
                  {m.deepen_game({ time: formatDuration(deepenSeconds(shallow)) })}
                </Button>
              </span>
            )
          )
        }
      />
      {tracked?.stage === 'deepening' ? (
        <DeepenProgress
          done={tracked.done}
          total={tracked.total}
          paused={tracked.paused}
          background={tracked.by === 'background'}
          onStop={() => stopGame(ref)}
        />
      ) : tracked ? (
        <p className="text-xs text-muted-foreground">
          {tracked.by === 'background' ? m.deepen_background() : m.deepen_waiting()}
        </p>
      ) : (
        deepen && shallow > 0 && <DeepenButton game={game} shallow={shallow} />
      )}
    </div>
  )
}

/** A deepening's progress; the player's own can be stopped (what was found stays). */
function DeepenProgress({
  done,
  total,
  paused = false,
  background = false,
  onStop,
}: {
  done: number
  total: number
  paused?: boolean
  background?: boolean
  onStop: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-40 flex-1 space-y-1.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          {m.deepen_running({ done: formatNumber(done), total: formatNumber(total) })}
          {background && <> · {m.analysis_here_background_short()}</>}
          {paused && <> · {m.deepen_paused()}</>}
        </p>
        <Progress value={(done / Math.max(total, 1)) * 100} />
      </div>
      {/* The background analysis is paused from the header, not game by game */}
      {!background && (
        <Button variant="ghost" size="sm" onClick={onStop} className="text-muted-foreground">
          <Square data-icon="inline-start" />
          {m.deepen_stop()}
        </Button>
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
