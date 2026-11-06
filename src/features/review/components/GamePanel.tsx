import { Check, Gauge, Microscope, Square } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useBackground } from '@/features/background/backgroundContext'
import { formatDuration, formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'
import { withActivity } from '@/lib/activity'
import { deepenGame, shallowPositions, withDeepPosition, type ReviewedGame } from '../analyze'
import { movesHash } from '../cache'
import { deepenSeconds } from '../estimate'
import { reviewedGameKey, useAnalysisSession } from '../sessionContext'
import { EvalChart } from './EvalChart'

/**
 * An analysed game, opened in the results: its opponent on a phone (hidden from the row), the
 * evaluation chart, whether every move had a deep look (on the legend's line), and deepening the
 * positions that only had a quick look, or its progress. `deepen`: false outside the analysis's
 * results (a game of the profile, judged from the cache), where the session cannot deepen it: the
 * game is deepened here instead, from the legend's line (`onDeepened` once done, for the list to
 * read it again), and the progress of a deepening under way elsewhere shows (the analysis's, the
 * background analysis's). `ratingChange`: for the chart's summary of the game, when known (Lichess
 * says it itself). `train`: the training of the game's errors, beside the review page's button in
 * the chart's details.
 */
export function GamePanel({
  game: received,
  deepen = true,
  ratingChange,
  train,
  onDeepened,
}: {
  game: ReviewedGame
  deepen?: boolean
  ratingChange?: number
  train?: ReactNode
  onDeepened?: () => void
}) {
  const { deepening, stopDeepening } = useAnalysisSession()
  const here = useDeepenHere(received, onDeepened)
  const game = here.game
  const background = useBackground()?.state
  const running = deepening?.gameKey === reviewedGameKey(game) ? deepening : undefined
  const inBackground =
    !running &&
    background?.phase === 'deepening' &&
    background.deepening?.includes(movesHash(game.sanMoves, game.initialFen))
  const shallow = shallowPositions(game).length
  const busy = running !== undefined || inBackground || here.progress !== undefined

  return (
    <div className="space-y-3">
      {/* On a phone, the opponent the row hides; its date and platform would be too much */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:hidden">
        <span className="inline-flex items-center gap-2">
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
                  onClick={here.start}
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
      {here.progress ? (
        <DeepenProgress done={here.progress.done} total={here.progress.total} onStop={here.stop} />
      ) : running ? (
        <DeepenProgress
          done={running.done}
          total={running.total}
          paused={running.paused}
          onStop={stopDeepening}
        />
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

/**
 * Deepens `received` right here, outside the analysis's session (a game of the profile): the game
 * with its deeper positions while it runs, until the list gives it again (`onDeepened` once done).
 * Stopped when the panel closes; what was computed stays in the cache.
 */
function useDeepenHere(received: ReviewedGame, onDeepened?: () => void) {
  const { draft } = useAnalysisSession()
  const [local, setLocal] = useState<{ from: ReviewedGame; game: ReviewedGame }>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const job = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => job.current?.abort(), [])

  const start = async () => {
    const controller = new AbortController()
    job.current = controller
    let current = received
    const total = shallowPositions(current).length
    let done = 0
    setProgress({ done, total })
    try {
      await withActivity(() =>
        deepenGame(current, {
          signal: controller.signal,
          onPosition: (index, cp) => {
            current = withDeepPosition(current, index, cp, draft.criteria)
            done += 1
            setLocal({ from: received, game: current })
            setProgress({ done, total })
          },
        }),
      )
      if (!controller.signal.aborted) onDeepened?.()
    } catch (error) {
      if (!controller.signal.aborted) console.error('Deepening failed', error)
    } finally {
      if (job.current === controller) {
        job.current = undefined
        setProgress(undefined)
      }
    }
  }
  const stop = () => {
    job.current?.abort()
    job.current = undefined
    setProgress(undefined)
  }
  // Once the list gives the game again (read from the cache), it is the one shown.
  const game = local?.from === received ? local.game : received
  return { game, progress, start: () => void start(), stop }
}

function DeepenProgress({
  done,
  total,
  paused = false,
  onStop,
}: {
  done: number
  total: number
  paused?: boolean
  onStop: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-40 flex-1 space-y-1.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          {m.deepen_running({ done: formatNumber(done), total: formatNumber(total) })}
          {paused && <> · {m.deepen_paused()}</>}
        </p>
        <Progress value={(done / Math.max(total, 1)) * 100} />
      </div>
      <Button variant="ghost" size="sm" onClick={onStop} className="text-muted-foreground">
        <Square data-icon="inline-start" />
        {m.deepen_stop()}
      </Button>
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
