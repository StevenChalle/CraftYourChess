import { createContext, useContext } from 'react'
import type { Mistake, ReviewOutcome } from './analyze'
import type { FetchProgress, FoundGames, ReviewAccount } from './fetch'
import type { GameLibrary } from './library'
import type { ReviewProgress } from './progress'
import type { GameSelection } from './selection'
import type { ReviewSettings } from './settings'
import type { TrainingProgress } from '@/features/training/session'
import type { Exercise, TrainingSettings } from '@/features/training/settings'
import type { ReviewCriteria } from './criteria'
import type { ProfileSearch } from '@/features/player/search'

/**
 * The profile's analysis and training, shared by its pages (profile, analysis, training, review):
 * see AnalysisSessionProvider (session.tsx).
 */

/** The pages an open analysis goes with: leaving them for another closes it. */
export const ANALYSIS_PAGES = ['/player/analysis', '/player/training', '/player/review']
/** The training's page: leaving it closes the training. */
export const TRAINING_PAGE = '/player/training'

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
 * A training: first its options, then the board. `run` changes with every restart, which
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

/** Where a training was opened: back there when it closes. */
export type TrainingOrigin = { to: string; search: Record<string, unknown> }

/** The training open, on its own page: one at a time, closed when the page is left. */
export type OpenTraining = {
  /** The errors it can replay */
  mistakes: Mistake[]
  /** The analysis's rules: valid moves when replaying, and the lowest error */
  validMaxDrop: number
  errorMinDrop: number
  phase: TrainingPhase
  /** Every position has been played: leaving it asks nothing */
  finished: boolean
  /** How far it went, for a reload of the page */
  progress?: TrainingProgress
  from: TrainingOrigin
}

export type Session = {
  accounts: ReviewAccount[]
  /** The profile searched (or the import), for links to its pages */
  usernames: ProfileSearch
  /** Where the games come from: the accounts, or imported games */
  library: GameLibrary
  /** Games played on all the accounts, an indication */
  gameTotal: number
  /** The filters and options being edited */
  draft: ReviewSettings
  setDraft: (settings: ReviewSettings) => void
  search: SearchState
  analysis: AnalysisState
  /** Increases with every analysis launched */
  analysisId: number
  training: OpenTraining | undefined
  /** A training asked by a link waits for its game's analysis */
  trainingPending: boolean
  /** The settings of the current analysis, which each section of the form can go back to */
  analysisSettings: ReviewSettings | undefined
  /** Looks for the games of the filters being edited (the filters tab calls it on every change) */
  find: () => void
  /** Analyses the games found, with the rules being edited (asks first if an analysis exists) */
  launch: () => Promise<void>
  /** Opens the training page on its options, for the errors of the current analysis */
  newTraining: () => void
  /**
   * Opens the training page replaying these errors right away, with the default options; judged
   * with `criteria` (the analysis's when omitted)
   */
  trainGame: (mistakes: Mistake[], criteria?: ReviewCriteria) => void
  /** Starts the training with these options, remembered for next time */
  launchTraining: (settings: TrainingSettings) => void
  /** The same training again, in a new draw */
  restartTraining: () => void
  /** These positions again (the moves missed at first), moves only */
  replayMissed: (puzzles: Mistake[]) => void
  setTrainingFinished: (finished: boolean) => void
  setTrainingProgress: (progress: TrainingProgress) => void
  /** Leaves the training page, back where it was opened (asks first while it is under way) */
  leaveTraining: () => void
  /** Stops the analysis under way and drops it: the filters stay, to change them */
  stopAnalysis: () => void
  /** The deepening under way, if any */
  deepening: Deepening | undefined
  /** Deepens these games of the analysis, one after the other (replaces any deepening) */
  deepenGames: (gameKeys: string[], scope: Deepening['scope']) => void
  /** Stops the deepening: what was found stays */
  stopDeepening: () => void
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
