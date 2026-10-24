import { createFileRoute, Navigate } from '@tanstack/react-router'
import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReviewResults } from '@/features/review/components/ReviewResults'
import { ReviewSteps } from '@/features/review/components/ReviewSteps'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/player/results')({
  component: ResultsTab,
})

/** The analysis: its steps while it runs, then the games and their errors. */
function ResultsTab() {
  const { analysis, trainGame, stopAnalysis } = useAnalysisSession()
  const search = Route.useSearch()

  // Nothing in memory (page reloaded, link shared): back to the filters. A review asked by the
  // link (start, game) is about to start.
  if (analysis.status === 'none') {
    if (search.start || search.game) return null
    return (
      <Navigate
        to="/player/analysis"
        search={{ lichess: search.lichess, chesscom: search.chesscom }}
        replace
      />
    )
  }

  const single =
    analysis.settings.selection.scope.kind === 'latest' &&
    analysis.settings.selection.scope.count === 1
  return (
    <div className="space-y-3">
      {analysis.status === 'running' ? (
        <ReviewSteps progress={analysis.progress} single={single} />
      ) : analysis.status === 'error' ? (
        <p className="text-loss">{m.review_failed()}</p>
      ) : (
        <ReviewResults outcome={analysis.outcome} onTrain={trainGame} />
      )}
      {analysis.status === 'running' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Only phones freeze a hidden page: a computer goes on computing in the background. */}
          <p className="hidden text-sm text-muted-foreground pointer-coarse:block">
            {m.analysis_keep_open()}
          </p>
          {/* A large analysis launched by mistake: stop it and change the filters. */}
          <Button variant="outline" onClick={stopAnalysis} className="ml-auto">
            <Square data-icon="inline-start" />
            {m.analysis_stop()}
          </Button>
        </div>
      )}
    </div>
  )
}
