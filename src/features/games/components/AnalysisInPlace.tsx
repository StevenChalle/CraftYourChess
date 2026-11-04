import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { analyzeGames, type ReviewedGame } from '@/features/review/analyze'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import type { ReviewProgress } from '@/features/review/progress'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { withActivity } from '@/lib/activity'
import { formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'

/** The game being analysed in the list, by reference (gameRef), and where it stands. */
export type AnalysisHere = { ref: string; progress?: ReviewProgress; failed?: boolean }

/**
 * Analyses one game of a list right there, without going to the analysis tab: one at a time, with
 * the analysis's criteria, Stockfish counting as the player's activity. The games analysed here are
 * kept (by reference) until the list reads them from the cache; `onDone` once one is.
 * Stopped when the list goes away.
 */
export function useAnalysisHere(onDone: () => void) {
  const { draft } = useAnalysisSession()
  const [current, setCurrent] = useState<AnalysisHere>()
  const [analysed, setAnalysed] = useState<ReadonlyMap<string, ReviewedGame>>(new Map())
  const job = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => job.current?.abort(), [])

  const start = async (game: ReviewGame) => {
    if (job.current) return
    const ref = gameRef(game)
    const controller = new AbortController()
    job.current = controller
    setCurrent({ ref })
    try {
      const [reviewed] = await withActivity(() =>
        analyzeGames([game], draft.criteria, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) setCurrent({ ref, progress })
          },
        }),
      )
      if (controller.signal.aborted) return
      if (reviewed) setAnalysed((before) => new Map(before).set(ref, reviewed))
      setCurrent(undefined)
      onDone()
    } catch (error) {
      if (controller.signal.aborted) return
      console.error('Analysis failed', error)
      setCurrent({ ref, failed: true })
    } finally {
      if (job.current === controller) job.current = undefined
    }
  }

  const stop = () => {
    job.current?.abort()
    job.current = undefined
    setCurrent(undefined)
  }

  return { current, analysed, start: (game: ReviewGame) => void start(game), stop }
}

/** In the row's panel while its game is analysed: the progress, or the failure. */
export function AnalysisProgress({ state, onStop }: { state: AnalysisHere; onStop: () => void }) {
  if (state.failed) return <p className="py-2 text-sm text-loss">{m.review_failed()}</p>
  const progress = state.progress
  const analysing = progress?.phase === 'analysing' ? progress : undefined
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs text-muted-foreground tabular-nums">
          {analysing
            ? m.study_analysing({
                done: formatNumber(analysing.done),
                total: formatNumber(analysing.total),
              })
            : m.study_analysis_starting()}
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
