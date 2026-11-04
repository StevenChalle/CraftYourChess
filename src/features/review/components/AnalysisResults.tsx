import { Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages'
import { useAnalysisSession } from '../sessionContext'
import { ReviewResults } from './ReviewResults'
import { ReviewSteps } from './ReviewSteps'

/** Under the analysis's filters: its steps while it runs, then the games and their errors. */
export function AnalysisResults() {
  const { analysis, trainGame, stopAnalysis } = useAnalysisSession()
  if (analysis.status === 'none') return null
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
        <ReviewResults outcome={analysis.outcome} onTrain={(mistakes) => trainGame(mistakes)} />
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
