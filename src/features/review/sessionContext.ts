import { createContext, useContext } from 'react'
import type { Mistake, ReviewOutcome } from './analyze'
import type { FetchProgress, FoundGames, ReviewAccount } from './fetch'
import type { GameLibrary } from './library'
import type { ReviewProgress } from './progress'
import type { GameSelection } from './selection'
import type { ReviewSettings } from './settings'
import type { Exercise, TrainingSettings } from '@/features/training/settings'

/**
 * The analysis page's state, shared by its tabs (filters, analysis, training): see
 * AnalysisSessionProvider (session.tsx).
 */

export type SearchState =
  | { status: 'idle' }
  /** `progress` once the platforms report some */
  | { status: 'finding'; progress?: FetchProgress }
  | { status: 'found'; found: FoundGames; selection: GameSelection }
  | { status: 'error'; error: Error }

export type AnalysisState =
  | { status: 'none' }
  | { status: 'running'; progress: ReviewProgress; settings: ReviewSettings }
  | { status: 'done'; outcome: ReviewOutcome; settings: ReviewSettings }
  | { status: 'error'; error: Error; settings: ReviewSettings }

/**
 * A training tab: first its options, then the board. `run` changes with every restart, which
 * remounts TrainingView (fresh draw and engine).
 */
export type TrainingPhase =
  | { kind: 'options' }
  | {
      kind: 'running'
      puzzles: Mistake[]
      settings: TrainingSettings
      run: number
      /** Replaces the settings' exercises: replaying the missed moves only replays moves */
      exercises?: Exercise[]
    }

export type TrainingTab = {
  /** Fixed for the tab's life, the smallest free one when opened: its title and route */
  number: number
  /** The analysis its errors come from: an older one once another analysis is launched */
  analysisId: number
  /** The errors it can replay, kept even when another analysis replaces them */
  mistakes: Mistake[]
  /** The analysis's rules: valid moves when replaying, and the lowest error */
  validMaxDrop: number
  errorMinDrop: number
  phase: TrainingPhase
  /** Every position has been played: closing it asks nothing */
  finished: boolean
}

export type Session = {
  accounts: ReviewAccount[]
  /** Where the games come from: the accounts, or imported games */
  library: GameLibrary
  /** Games played on all the accounts, an indication */
  gameTotal: number
  /** The filters and options being edited */
  draft: ReviewSettings
  setDraft: (settings: ReviewSettings) => void
  search: SearchState
  analysis: AnalysisState
  /** Increases with every analysis launched: trainings from an older one are told apart */
  analysisId: number
  trainings: TrainingTab[]
  /** The settings of the current analysis, which each section of the form can go back to */
  analysisSettings: ReviewSettings | undefined
  /** Looks for the games of the filters being edited (the filters tab calls it on every change) */
  find: () => void
  /** Analyses the games found, with the rules being edited (asks first if an analysis exists), then shows the analysis tab */
  launch: () => Promise<void>
  /** Opens a training tab on its options, for the errors of the current analysis */
  newTraining: () => void
  /** Opens a training tab replaying these errors right away, with the default options */
  trainGame: (mistakes: Mistake[]) => void
  /** Starts the training of a tab with these options, remembered for next time */
  launchTraining: (number: number, settings: TrainingSettings) => void
  /** The same training again, in a new draw */
  restartTraining: (number: number) => void
  /** These positions again (the moves missed at first), moves only */
  replayMissed: (number: number, puzzles: Mistake[]) => void
  /** Closes a training tab (asks first unless every position has been played) */
  closeTraining: (number: number) => Promise<void>
  setTrainingFinished: (number: number, finished: boolean) => void
  /** Back to the analysis results */
  showResults: () => void
  /** Stops the analysis under way, drops it and shows the filters */
  stopAnalysis: () => void
  /** The deepening under way, if any */
  deepening: Deepening | undefined
  /** Deepens these games of the analysis, one after the other (replaces any deepening) */
  deepenGames: (gameKeys: string[], scope: Deepening['scope']) => void
  /** Stops the deepening: what was found stays */
  stopDeepening: () => void
}

/** The smallest number no open training tab has: closed tabs free theirs. */
export function freeNumber(trainings: Pick<TrainingTab, 'number'>[]): number {
  const used = new Set(trainings.map((tab) => tab.number))
  let number = 1
  while (used.has(number)) number += 1
  return number
}

/** A game's key in the results: its platform and id. */
export function reviewedGameKey(game: { source: string; id: string }): string {
  return `${game.source}-${game.id}`
}

/**
 * Deepening the analysis of one game, or of every game not deep yet (one after the other). One at
 * a time; the evaluations come into the analysis's games as they are found.
 */
export type Deepening = {
  scope: 'game' | 'all'
  /** The game being deepened */
  gameKey: string
  /** Its positions done so far, out of `total` */
  done: number
  total: number
  /** Games still waiting after this one (scope "all") */
  gamesLeft: number
  /** Stockfish is used elsewhere (a training…): it goes on once that is over */
  paused: boolean
}

export const SessionContext = createContext<Session | undefined>(undefined)

export function useAnalysisSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useAnalysisSession outside AnalysisSessionProvider')
  return session
}
