import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { TrackedAnalysis } from '@/features/review/tracker'
import { formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'

/**
 * In the row's panel while its game is analysed, by the player or in the background: waiting for
 * its turn, or which step (a quick look at every position, then a deep check of the suspicious
 * moves, as on the analysis page) with its progress on a single bar; or the failure. `onStop`: the
 * player's own analysis only.
 */
export function AnalysisProgress({
  analysis,
  failed = false,
  onStop,
}: {
  analysis: TrackedAnalysis | undefined
  failed?: boolean
  onStop?: () => void
}) {
  if (failed || !analysis) return <p className="py-2 text-sm text-loss">{m.review_failed()}</p>
  const deep = analysis.stage === 'deep'
  const counting = analysis.stage === 'quick' || deep
  const background = analysis.by === 'background'
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1 space-y-1.5">
        {analysis.stage === 'waiting' ? (
          <p className="text-xs text-muted-foreground">
            {background ? m.analysis_here_background() : m.analysis_here_waiting()}
          </p>
        ) : (
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span className="num font-medium text-primary">
              {m.analysis_here_step({ step: deep ? 2 : 1, steps: 2 })}
            </span>
            <span className="text-text-strong">
              {deep ? m.review_step_deep() : m.review_step_quick()}
            </span>
            <span>· {deep ? m.review_step_deep_hint() : m.review_step_quick_hint()}</span>
            {background && <span>· {m.analysis_here_background_short()}</span>}
            {counting && (
              <span className="ml-auto tabular-nums">
                {formatNumber(analysis.done)} / {formatNumber(analysis.total)}
              </span>
            )}
          </p>
        )}
        <Progress
          value={counting ? (analysis.done / Math.max(analysis.total, 1)) * 100 : 0}
          data-loading={counting ? undefined : true}
        />
      </div>
      {onStop && !background && (
        <Button variant="ghost" size="sm" onClick={onStop} className="text-muted-foreground">
          {m.deepen_stop()}
        </Button>
      )}
    </div>
  )
}
