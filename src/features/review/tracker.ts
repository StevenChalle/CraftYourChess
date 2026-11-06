import { useSyncExternalStore } from 'react'
import type { GameProgress, ReviewedGame } from './analyze'
import type { ReviewCriteria } from './criteria'
import { gameRef } from './gameRef'
import type { ReviewGame } from './games'

/**
 * The analyses under way in this tab, game by game (by gameRef), whoever runs them: the player (a
 * game analysed from a list or its review page, a deepening) or the background analysis of the
 * favorites. The lists show from it a game's loader, its steps, its result as soon as it is
 * judged, and its deepening as it goes. Also the latest result of each game analysed here, for the
 * lists to show it before they read it again from the cache.
 */

/**
 * A game's analysis under way: waiting for its turn, in the quick pass, in the deep pass around its
 * suspicious moves, or deepening every other position (`done` of `total` positions in that step).
 * `review`: the game judged so far, once its two passes are done (then updated as it deepens).
 */
export type TrackedAnalysis = {
  by: 'player' | 'background'
  stage: 'waiting' | 'quick' | 'deep' | 'deepening'
  done: number
  total: number
  /** Deepening, given way to another use of Stockfish: it goes on once that is over */
  paused?: boolean
  review?: ReviewedGame
}

/** A game's latest result here, with the criteria it was judged with. */
export type TrackedResult = { review: ReviewedGame; criteria: ReviewCriteria }

export type TrackerSnapshot = {
  active: ReadonlyMap<string, TrackedAnalysis>
  results: ReadonlyMap<string, TrackedResult>
  /** Changes whenever a game's analysis or deepening ends: the cache has more to read */
  revision: number
}

export type Tracker = ReturnType<typeof createTracker>

export function createTracker() {
  let snapshot: TrackerSnapshot = { active: new Map(), results: new Map(), revision: 0 }
  const listeners = new Set<() => void>()
  const commit = (next: Partial<TrackerSnapshot>) => {
    snapshot = { ...snapshot, ...next }
    for (const listener of listeners) listener()
  }

  return {
    get: (): TrackerSnapshot => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** A game's analysis starts, or moves on (`review` kept unless given) */
    set(ref: string, analysis: TrackedAnalysis) {
      const before = snapshot.active.get(ref)
      const review = analysis.review ?? before?.review
      commit({
        active: new Map(snapshot.active).set(ref, { ...analysis, ...(review && { review }) }),
      })
    },
    /** Changes a game's analysis under way, if it still is */
    update(ref: string, change: Partial<TrackedAnalysis>) {
      const before = snapshot.active.get(ref)
      if (before) commit({ active: new Map(snapshot.active).set(ref, { ...before, ...change }) })
    },
    /** A game's result, judged with `criteria`, while its analysis may go on */
    result(ref: string, review: ReviewedGame, criteria: ReviewCriteria) {
      commit({ results: new Map(snapshot.results).set(ref, { review, criteria }) })
    },
    /** A game's analysis ends (done, stopped or failed): its latest result stays, if any */
    end(ref: string, last?: { review: ReviewedGame; criteria: ReviewCriteria }) {
      const active = new Map(snapshot.active)
      active.delete(ref)
      const results = last ? new Map(snapshot.results).set(ref, last) : snapshot.results
      commit({ active, results, revision: snapshot.revision + 1 })
    },
  }
}

/** The tab's tracker, shared by the session, the lists and the background analysis. */
export const tracker = createTracker()

export function useTracker(): TrackerSnapshot {
  return useSyncExternalStore(tracker.subscribe, tracker.get, tracker.get)
}

/** The same rules, whatever the object holding them. */
export function sameCriteria(a: ReviewCriteria, b: ReviewCriteria): boolean {
  return a.errorMinDrop === b.errorMinDrop && a.validMaxDrop === b.validMaxDrop
}

/**
 * A game as a list shows it, judged with `criteria`: the one under analysis here (as far as it
 * went), else its latest result here (if judged with the same rules), else the cache's.
 */
export function trackedReview(
  snapshot: TrackerSnapshot,
  ref: string,
  criteria: ReviewCriteria,
  cached: ReviewedGame | undefined,
): ReviewedGame | undefined {
  const result = snapshot.results.get(ref)
  return (
    snapshot.active.get(ref)?.review ??
    (result && sameCriteria(result.criteria, criteria) ? result.review : undefined) ??
    cached
  )
}

/**
 * Reports an analysis of `games` (analyzeGames's `onGame`) to `target`, and ends what it left
 * under way (`close`, once it is over, done or not).
 */
export function reportAnalysis(
  target: Tracker,
  games: ReviewGame[],
  criteria: ReviewCriteria,
  by: TrackedAnalysis['by'],
) {
  const refs = games.map(gameRef)
  const open = new Set<string>()
  return {
    onGame(index: number, progress: GameProgress) {
      const ref = refs[index]
      if (ref === undefined) return
      if (progress.stage === 'done') {
        open.delete(ref)
        target.end(ref, { review: progress.review, criteria })
        return
      }
      open.add(ref)
      target.set(ref, { by, stage: progress.stage, done: progress.done, total: progress.total })
    },
    close() {
      // Not a game someone else took over meanwhile (the player, from the background).
      for (const ref of open) if (target.get().active.get(ref)?.by === by) target.end(ref)
      open.clear()
    },
  }
}
