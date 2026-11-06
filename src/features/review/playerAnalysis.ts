import { beginActivity, waitForOthers, watchOthers, withActivity } from '@/lib/activity'
import {
  analyzeGames,
  deepenGame,
  shallowPositions,
  withDeepPosition,
  type GameProgress,
  type ReviewedGame,
} from './analyze'
import type { ReviewCriteria } from './criteria'
import { gameRef } from './gameRef'
import type { ReviewGame } from './games'
import { reportAnalysis, type Tracker } from './tracker'

/**
 * The player's own analyses of single games (from a list, from a game's review page) and the
 * deepenings, in this tab: one analysis at a time, in the order asked, then one deepening at a
 * time, in the order asked. A game analysed this way is deepened afterwards on its own (every
 * position the engine only looked at quickly gets a deep look). Each game's progress goes to the
 * tracker, for the lists.
 *
 * The deepenings, here the only ones (those of the advanced analysis's games too: two at once
 * would each give way to the other), give way to any other use of Stockfish (an analysis asked
 * meanwhile, the live engine of a review page, a training): they pause, then go on a few seconds
 * after the last one ends. What was evaluated stays (the cache): a deepening stopped and asked
 * again only does what is left.
 */

/** 'all': the advanced analysis's games, deepened together; 'game': one asked on its own. */
export type DeepenScope = 'game' | 'all'

export type PlayerAnalysisState = {
  /** The games to analyse, the first one under way */
  analysing: string[]
  /** Analyses that failed: the lists say so */
  failed: ReadonlySet<string>
  /** The deepening under way */
  deepening?: { ref: string; scope: DeepenScope; done: number; total: number; paused: boolean }
  /** The deepenings waiting, in order */
  waiting: { ref: string; scope: DeepenScope }[]
}

/** What it works with: injected, so that tests need no engine. */
export type PlayerAnalysisDeps = {
  analyze: (
    game: ReviewGame,
    criteria: ReviewCriteria,
    options: { signal: AbortSignal; onGame: (index: number, progress: GameProgress) => void },
  ) => Promise<ReviewedGame | undefined>
  deepen: (
    game: ReviewedGame,
    options: { signal: AbortSignal; onPosition: (index: number, cp: number) => void },
  ) => Promise<void>
  /** lib/activity.ts */
  beginActivity: () => () => void
  watchOthers: (onActive: () => void) => () => void
  waitForOthers: (signal: AbortSignal) => Promise<void>
}

type AnalysisItem = {
  ref: string
  game: ReviewGame
  criteria: ReviewCriteria
  deepen: boolean
  controller: AbortController
}
type DeepenItem = {
  ref: string
  game: ReviewedGame
  criteria: ReviewCriteria
  scope: DeepenScope
  controller: AbortController
}

export type PlayerAnalysis = ReturnType<typeof createPlayerAnalysis>

export function createPlayerAnalysis(
  target: Tracker,
  deps: PlayerAnalysisDeps,
  /** Each game as it deepens: the advanced analysis follows its own games with it */
  onDeepened?: (ref: string, game: ReviewedGame) => void,
) {
  const analyses: AnalysisItem[] = []
  const deepenings: DeepenItem[] = []
  let failed: ReadonlySet<string> = new Set()
  let analysing = false
  /** The deepenings' loop runs (between two games too) */
  let deepeningLoop = false
  let deepening: { item: DeepenItem; done: number; total: number; paused: boolean } | undefined
  let state: PlayerAnalysisState = { analysing: [], failed, waiting: [] }
  const listeners = new Set<() => void>()

  const publish = () => {
    state = {
      analysing: analyses.map((item) => item.ref),
      failed,
      deepening: deepening && {
        ref: deepening.item.ref,
        scope: deepening.item.scope,
        done: deepening.done,
        total: deepening.total,
        paused: deepening.paused,
      },
      waiting: deepenings.map(({ ref, scope }) => ({ ref, scope })),
    }
    for (const listener of listeners) listener()
  }

  /** The game as far as its deepening went: the tracker's, else the one asked */
  const latest = (item: DeepenItem) => target.get().active.get(item.ref)?.review ?? item.game

  const runAnalyses = async () => {
    if (analysing) return
    analysing = true
    while (analyses.length > 0) {
      const item = analyses[0]!
      const report = reportAnalysis(target, [item.game], item.criteria, 'player')
      let judged = false
      try {
        const review = await deps.analyze(item.game, item.criteria, {
          signal: item.controller.signal,
          onGame: (index, progress) => {
            if (!item.controller.signal.aborted) report.onGame(index, progress)
          },
        })
        judged = !item.controller.signal.aborted && review !== undefined
        if (judged && review && item.deepen) {
          queueDeepening([{ game: review, criteria: item.criteria }], 'game')
        }
      } catch (error) {
        if (!item.controller.signal.aborted) {
          console.error('Analysis failed', error)
          failed = new Set(failed).add(item.ref)
        }
      } finally {
        report.close()
        // Stopped or failed before any progress: no longer waiting.
        if (!judged && target.get().active.get(item.ref)?.by === 'player') target.end(item.ref)
      }
      if (analyses[0] === item) analyses.shift()
      publish()
    }
    analysing = false
  }

  const deepenOne = async (item: DeepenItem) => {
    const { ref, criteria, controller } = item
    const total = shallowPositions(latest(item)).length
    if (total === 0) {
      target.end(ref, { review: latest(item), criteria })
      return
    }
    deepening = { item, done: 0, total, paused: false }
    target.set(ref, {
      by: 'player',
      stage: 'deepening',
      done: 0,
      total,
      review: latest(item),
    })
    publish()
    while (!controller.signal.aborted) {
      // The positions deepened before a pause are precise now: only the others are left.
      const game = latest(item)
      const left = shallowPositions(game).length
      if (left === 0) break
      deepening = { item, done: total - left, total, paused: false }
      target.update(ref, { done: total - left, paused: false })
      publish()
      const yielded = new AbortController()
      const stopWatching = deps.watchOthers(() => yielded.abort())
      try {
        await deps.deepen(game, {
          signal: AbortSignal.any([controller.signal, yielded.signal]),
          onPosition: (index, cp) => {
            if (controller.signal.aborted) return
            const deeper = withDeepPosition(latest(item), index, cp, criteria)
            const done = total - shallowPositions(deeper).length
            target.update(ref, { review: deeper, done })
            deepening = { item, done, total, paused: false }
            onDeepened?.(ref, deeper)
            publish()
          },
        })
      } catch (error) {
        if (!controller.signal.aborted && !yielded.signal.aborted) {
          console.error('Deepening failed', error)
          break
        }
      } finally {
        stopWatching()
      }
      if (controller.signal.aborted || !yielded.signal.aborted) break
      // Another use of Stockfish: wait for it to end, then go on with this game.
      deepening = { item, done: deepening.done, total, paused: true }
      target.update(ref, { paused: true })
      publish()
      await deps.waitForOthers(controller.signal)
    }
    target.end(ref, { review: latest(item), criteria })
  }

  const runDeepenings = async () => {
    if (deepeningLoop) return
    deepeningLoop = true
    const endActivity = deps.beginActivity()
    try {
      while (deepenings.length > 0) {
        const item = deepenings.shift()!
        publish()
        await deepenOne(item)
        deepening = undefined
        publish()
      }
    } finally {
      deepening = undefined
      deepeningLoop = false
      endActivity()
      publish()
    }
  }

  /** Waiting or under way: its deepening item */
  const deepenItem = (ref: string) =>
    deepening?.item.ref === ref ? deepening.item : deepenings.find((item) => item.ref === ref)

  function queueDeepening(
    entries: { game: ReviewedGame; criteria: ReviewCriteria }[],
    scope: DeepenScope,
    { replace = false }: { replace?: boolean } = {},
  ) {
    const refs = entries.map((entry) => gameRef(entry.game))
    if (replace) {
      // The deepenings of that scope give way to these, in this order.
      for (let index = deepenings.length - 1; index >= 0; index--) {
        if (deepenings[index]!.scope === scope) {
          const [dropped] = deepenings.splice(index, 1)
          target.end(dropped!.ref)
        }
      }
      if (deepening?.item.scope === scope && refs[0] !== deepening.item.ref) {
        deepening.item.controller.abort()
      }
    }
    for (const [index, entry] of entries.entries()) {
      const ref = refs[index]!
      if (deepenItem(ref) || shallowPositions(entry.game).length === 0) continue
      deepenings.push({
        ref,
        game: entry.game,
        criteria: entry.criteria,
        scope,
        controller: new AbortController(),
      })
      target.set(ref, {
        by: 'player',
        stage: 'waiting',
        done: 0,
        total: shallowPositions(entry.game).length,
        review: entry.game,
      })
    }
    publish()
    void runDeepenings()
  }

  return {
    get: (): PlayerAnalysisState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Analyses this game after those asked before it, then deepens it (`deepen`) */
    analyze(game: ReviewGame, criteria: ReviewCriteria, { deepen = true } = {}) {
      const ref = gameRef(game)
      if (analyses.some((item) => item.ref === ref)) return
      if (failed.has(ref)) {
        const next = new Set(failed)
        next.delete(ref)
        failed = next
      }
      analyses.push({ ref, game, criteria, deepen, controller: new AbortController() })
      target.set(ref, { by: 'player', stage: 'waiting', done: 0, total: 0 })
      publish()
      void runAnalyses()
    },
    /** Deepens these games after the others (`replace`: instead of the others of that scope) */
    deepen: queueDeepening,
    /** Stops this game's analysis or deepening, waiting or under way */
    stop(ref: string) {
      const analysis = analyses.findIndex((item) => item.ref === ref)
      if (analysis >= 0) {
        analyses[analysis]!.controller.abort()
        // The one under way leaves the queue once it has stopped.
        if (analysis > 0) {
          analyses.splice(analysis, 1)
          target.end(ref)
        }
      }
      const waiting = deepenings.findIndex((item) => item.ref === ref)
      if (waiting >= 0) {
        deepenings.splice(waiting, 1)
        target.end(ref)
      }
      if (deepening?.item.ref === ref) deepening.item.controller.abort()
      publish()
    },
    /** Stops every deepening of that scope */
    stopScope(scope: DeepenScope) {
      for (const item of deepenings.filter((entry) => entry.scope === scope)) {
        deepenings.splice(deepenings.indexOf(item), 1)
        target.end(item.ref)
      }
      if (deepening?.item.scope === scope) deepening.item.controller.abort()
      publish()
    },
    /** Stops everything: the page goes away */
    stopAll() {
      for (const item of analyses) item.controller.abort()
      for (const item of [...analyses.slice(1), ...deepenings]) target.end(item.ref)
      analyses.splice(1)
      deepenings.length = 0
      deepening?.item.controller.abort()
      publish()
    },
  }
}

/** The real engines and activities (lib/activity.ts): an analysis is an activity of the player. */
export function browserPlayerAnalysisDeps(): PlayerAnalysisDeps {
  return {
    analyze: async (game, criteria, { signal, onGame }) => {
      const [review] = await withActivity(() =>
        analyzeGames([game], criteria, { signal, onProgress: () => {}, onGame }),
      )
      return review
    },
    deepen: (game, { signal, onPosition }) => deepenGame(game, { signal, onPosition }),
    beginActivity,
    watchOthers: (onActive) => watchOthers(onActive),
    waitForOthers: (signal) => waitForOthers(signal),
  }
}
