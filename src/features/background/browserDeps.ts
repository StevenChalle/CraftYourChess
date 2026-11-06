import { gameStore } from '@/features/games/store'
import {
  analyzeGames,
  deepenPositions,
  gamesToDeepen,
  RECIPE,
  reviewFromCache,
  withDeepPosition,
  type ReviewedGame,
} from '@/features/review/analyze'
import { analysedGames, movesHash } from '@/features/review/cache'
import type { ReviewCriteria } from '@/features/review/criteria'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import { BACKGROUND_FETCHERS, findGames } from '@/features/review/fetch'
import { loadReviewSettings } from '@/features/review/settings'
import { reportAnalysis, tracker } from '@/features/review/tracker'
import { isActiveHere, isPlayerActive, onActivityChange } from '@/lib/activity'
import type { BackgroundDeps, Heartbeat, TabChannel } from './runner'

/**
 * The background analysis in the browser: the game store, the analysis cache, real engines. Each
 * game's progress goes to the tracker (tracker.ts), for the lists to show it as it goes.
 */
export function browserDeps(): BackgroundDeps {
  const criteria = () => loadReviewSettings(['lichess', 'chesscom']).criteria
  return {
    find: (accounts, selection, signal) =>
      findGames(accounts, selection, { signal, store: gameStore, fetchers: BACKGROUND_FETCHERS }),
    analysed: (games) =>
      analysedGames(
        games.map((game) => movesHash(game.sanMoves, game.initialFen)),
        RECIPE,
      ),
    analyze: async (games, rules, signal, onProgress) => {
      const report = reportAnalysis(tracker, games, rules, 'background')
      try {
        await analyzeGames(games, rules, {
          signal,
          // The deep pass is about as long as the quick one, though on far fewer positions.
          onProgress: (progress) => {
            if (progress.phase !== 'analysing' || progress.total === 0) return
            const share = progress.done / progress.total
            onProgress(progress.pass === 'quick' ? share / 2 : 0.5 + share / 2)
          },
          onGame: (index, progress) => {
            if (!signal.aborted) report.onGame(index, progress)
          },
        })
      } finally {
        report.close()
      }
    },
    criteria,
    toDeepen: (games) => gamesToDeepen(games),
    deepen: (games, signal, onProgress) => trackedDeepening(games, criteria(), signal, onProgress),
    isPlayerActive,
    isActiveHere,
    onActivityChange,
    sleep: (ms, signal) =>
      new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true },
        )
      }),
    locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
    channel: tabChannel(),
    isVisible: () => document.visibilityState === 'visible',
    now: Date.now,
  }
}

/** The working tab's heartbeat, between the app's tabs (nothing stored). */
function tabChannel(): TabChannel | undefined {
  if (typeof BroadcastChannel === 'undefined') return undefined
  const channel = new BroadcastChannel('craftyourchess:background')
  return {
    post: (heartbeat) => channel.postMessage(heartbeat),
    listen: (listener) => {
      const onMessage = (event: MessageEvent<Heartbeat>) => listener(event.data)
      channel.addEventListener('message', onMessage)
      return () => channel.removeEventListener('message', onMessage)
    },
  }
}

/**
 * Deepens the games (deepenPositions), each one followed in the tracker as it goes: the game judged
 * from the cache first, then again with each deep evaluation.
 */
async function trackedDeepening(
  games: ReviewGame[],
  criteria: ReviewCriteria,
  signal: AbortSignal,
  onProgress: (share: number) => void,
) {
  const refs = games.map(gameRef)
  const judged = new Map(
    (await reviewFromCache(games, criteria)).map((game) => [gameRef(game), game]),
  )
  const reviews = new Map<string, ReviewedGame>()
  const open = new Set<string>()
  try {
    await deepenPositions(games, {
      signal,
      onProgress,
      onGame: (index, { done, total, index: position, cp }) => {
        const ref = refs[index]
        if (ref === undefined || signal.aborted) return
        // Not a game the player took over meanwhile.
        const active = tracker.get().active.get(ref)
        if (active && active.by !== 'background') return
        let review = reviews.get(ref) ?? judged.get(ref)
        if (review && position !== undefined && cp !== undefined) {
          review = withDeepPosition(review, position, cp, criteria)
          reviews.set(ref, review)
        }
        if (done >= total) {
          open.delete(ref)
          tracker.end(ref, review && { review, criteria })
          return
        }
        open.add(ref)
        tracker.set(ref, { by: 'background', stage: 'deepening', done, total, review })
      },
    })
  } finally {
    for (const ref of open) {
      if (tracker.get().active.get(ref)?.by === 'background') tracker.end(ref)
    }
  }
}
