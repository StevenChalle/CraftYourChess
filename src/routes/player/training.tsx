import { createFileRoute, Navigate, useLocation } from '@tanstack/react-router'
import { BackLink } from '@/components/BackLink'
import { TRAINING_PAGE, useAnalysisSession } from '@/features/review/sessionContext'
import { TrainingSetup } from '@/features/training/components/TrainingSetup'
import { TrainingView } from '@/features/training/components/TrainingView'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/player/training')({
  component: TrainingPage,
})

/**
 * The training open, on its own page: its options until launched, then the board. Going back (the
 * link, the browser) closes it, asking first while it is under way; a reload brings it back.
 * Without a training (closed meanwhile, never opened): back to the analysis if one is open, else
 * the profile.
 */
function TrainingPage() {
  const search = Route.useSearch()
  const {
    usernames,
    analysis,
    training,
    trainingPending,
    launchTraining,
    restartTraining,
    replayMissed,
    setTrainingFinished,
    setTrainingProgress,
    leaveTraining,
  } = useAnalysisSession()
  const pathname = useLocation({ select: (location) => location.pathname })

  if (!training) {
    // Being left (the training closes as the address changes): wherever it goes is right.
    if (pathname !== TRAINING_PAGE) return null
    // A link asking for a game's training: its analysis comes first.
    if (trainingPending || search.game) {
      return <p className="text-muted-foreground">{m.study_analysis_starting()}</p>
    }
    return (
      <Navigate
        to={
          analysis.status !== 'none'
            ? '/player/analysis'
            : usernames.import
              ? '/player/history'
              : '/player'
        }
        search={usernames}
        replace
      />
    )
  }

  const back = (
    <BackLink label={backLabel(training.from.to, usernames.import)} onClick={leaveTraining} />
  )
  const phase = training.phase
  return (
    <div className="space-y-4">
      {back}
      {phase.kind === 'options' ? (
        <TrainingSetup
          mistakes={training.mistakes}
          errorMinDrop={training.errorMinDrop}
          onLaunch={launchTraining}
        />
      ) : (
        <TrainingView
          key={phase.run}
          puzzles={phase.puzzles}
          exercises={phase.exercises ?? phase.settings.exercises}
          validMaxDrop={training.validMaxDrop}
          progress={training.progress}
          onProgress={setTrainingProgress}
          onFinishedChange={setTrainingFinished}
          onRestart={restartTraining}
          onReplayMissed={replayMissed}
          onExit={leaveTraining}
        />
      )}
    </div>
  )
}

function backLabel(from: string, imported: boolean | undefined): string {
  if (from === '/player/analysis') return m.back_to_analysis()
  if (from === '/player/review') return m.back_to_game()
  return imported ? m.study_back_import() : m.study_back_profile()
}
