import { useEffect, useState } from 'react'
import { useBackground } from '@/features/background/backgroundContext'
import { RECIPE, reviewFromCache, type ReviewedGame } from './analyze'
import { analysedRefs } from './cache'
import type { ReviewCriteria } from './criteria'
import { gameRef } from './gameRef'
import type { ReviewGame } from './games'

/**
 * These games as the analysis would show them, by reference (gameRef), for those analysed before
 * with the current recipe, or on Lichess (its evaluations come with the game): judged from the
 * analysis cache with `criteria`, never with Stockfish.
 * Looked up again when the games or the criteria change, as the background analysis moves, and
 * when `refresh` changes (the game the analysis deepens: once it is over, read deep).
 */
export function useCachedReviews(
  games: ReviewGame[],
  criteria: ReviewCriteria,
  refresh?: string,
): Map<string, ReviewedGame> {
  const [reviewed, setReviewed] = useState<Map<string, ReviewedGame>>(() => new Map())
  const done = useBackground()?.state.done
  const key = games.map(gameRef).join()

  useEffect(() => {
    let current = true
    analysedRefs(games.map(gameRef), RECIPE)
      .then((analysed) =>
        reviewFromCache(
          // A game analysed on Lichess counts only if Lichess evaluated every move (checked there).
          games.filter((game) => analysed.has(gameRef(game)) || game.serverCps !== undefined),
          criteria,
        ),
      )
      .then((found) => {
        if (current) setReviewed(new Map(found.map((game) => [gameRef(game), game])))
      })
      // The cache unavailable: the games simply show as not analysed.
      .catch(() => {})
    return () => {
      current = false
    }
    // The games change with their references; looked up again as the background analysis moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, criteria, done, refresh])

  return reviewed
}
