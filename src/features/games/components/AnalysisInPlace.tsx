import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'
import type { AnalysisHere } from '../useAnalysisHere'

/**
 * In the row's panel while its game is analysed: which step (a quick look at every position, then a
 * deep check of the suspicious moves, as on the analysis page), its progress on a single bar; or the
 * failure.
 */
export function AnalysisProgress({ state, onStop }: { state: AnalysisHere; onStop: () => void }) {
  if (state.failed) return <p className="py-2 text-sm text-loss">{m.review_failed()}</p>
  const progress = state.progress
  const analysing = progress?.phase === 'analysing' ? progress : undefined
  // Starting the engine belongs to the quick look, as on the analysis page.
  const deep = analysing?.pass === 'deep'
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="num font-medium text-primary">
            {m.analysis_here_step({ step: deep ? 2 : 1, steps: 2 })}
          </span>
          <span className="text-text-strong">
            {deep ? m.review_step_deep() : m.review_step_quick()}
          </span>
          <span>· {deep ? m.review_step_deep_hint() : m.review_step_quick_hint()}</span>
          {analysing && (
            <span className="ml-auto tabular-nums">
              {formatNumber(analysing.done)} / {formatNumber(analysing.total)}
            </span>
          )}
        </p>
        <Progress
          value={analysing ? (analysing.done / Math.max(analysing.total, 1)) * 100 : 0}
          data-loading={analysing ? undefined : true}
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onStop} className="text-muted-foreground">
        {m.deepen_stop()}
      </Button>
    </div>
  )
}
