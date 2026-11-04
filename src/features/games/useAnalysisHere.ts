import { useEffect, useRef, useState } from 'react'
import { analyzeGames, type ReviewedGame } from '@/features/review/analyze'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import type { ReviewProgress } from '@/features/review/progress'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { withActivity } from '@/lib/activity'

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
