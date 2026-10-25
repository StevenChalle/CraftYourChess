import { Check, Microscope, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SideSquare } from '@/features/games/components/GamesTable'
import { SourceLabel } from '@/features/player/components/SourceBadge'
import { formatDate, formatDuration, formatNumber, formatTime } from '@/lib/format'
import { m } from '@/paraglide/messages'
import { shallowPositions, type ReviewedGame } from '../analyze'
import { deepenSeconds } from '../estimate'
import { reviewedGameKey, useAnalysisSession } from '../sessionContext'
import { EvalChart } from './EvalChart'

/**
 * An analysed game, opened in the results: the columns hidden on a phone, the evaluation chart,
 * and deepening the positions that only had a quick look.
 */
export function GamePanel({ game }: { game: ReviewedGame }) {
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
      <EvalChart game={game} />
      <DeepenGame game={game} />
    </div>
  )
}

/** "Deepen the analysis (≈ 1 min)", its progress while it runs, or "Deep analysis". */
function DeepenGame({ game }: { game: ReviewedGame }) {
  const { deepening, deepenGames, stopDeepening, analysis } = useAnalysisSession()
  const key = reviewedGameKey(game)
  const shallow = shallowPositions(game).length
  const running = deepening?.gameKey === key ? deepening : undefined

  // While every game is being deepened: this one first, then the others still to do.
  const deepenThis = () => {
    if (deepening?.scope !== 'all' || analysis.status !== 'done') return deepenGames([key], 'game')
    const others = analysis.outcome.games
      .filter((item) => reviewedGameKey(item) !== key && shallowPositions(item).length > 0)
      .map(reviewedGameKey)
    deepenGames([key, ...others], 'all')
  }

  if (running) {
    return (
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
        <Button variant="ghost" size="sm" onClick={stopDeepening} className="text-muted-foreground">
          <Square data-icon="inline-start" />
          {m.deepen_stop()}
        </Button>
      </div>
    )
  }
  if (shallow === 0) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-win" />
        {m.deepen_done()}
      </p>
    )
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
