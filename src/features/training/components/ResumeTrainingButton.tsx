import { Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trainingCount } from '@/features/review/openSession'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'

/**
 * Profile header, off the training's page: back to the training kept (left under way), with the
 * position it is at. A secondary button: the advanced analysis's stays the main one.
 */
export function ResumeTrainingButton() {
  const { training, resumeTraining } = useAnalysisSession()
  const count = trainingCount(training)
  if (!count) return null
  return (
    <Button
      size="lg"
      variant="outline"
      onClick={resumeTraining}
      className="max-sm:min-w-0 max-sm:flex-1"
    >
      <Swords data-icon="inline-start" />
      <span className="truncate max-sm:hidden">{m.training_resume()}</span>
      <span className="truncate sm:hidden">{m.training_resume_short()}</span>
      <span className="text-muted-foreground tabular-nums">
        {m.training_resume_count({
          current: formatNumber(count.current),
          total: formatNumber(count.total),
        })}
      </span>
    </Button>
  )
}
