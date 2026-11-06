import type { ProfileSearch } from '@/features/player/search'
import { defaultAutoDeepen, type ReviewSettings } from './settings'
import type { OpenTraining } from './sessionContext'

/**
 * The analysis and the training open on a profile, kept in this browser only so that reloading the
 * page brings them back: each is dropped as soon as it closes (the analysis when its pages are
 * left, the training when replaced, closed or over: see trainingUnderWay). The
 * evaluations stay in the analysis cache whatever happens: the analysis keeps its settings and its
 * games' references, and is run again from the cache.
 */
const ANALYSIS_KEY = 'craftyourchess:open-analysis'
const TRAINING_KEY = 'craftyourchess:open-training'

export type SavedAnalysis = {
  settings: ReviewSettings
  /** The games analysed (gameRef), once found */
  refs?: string[]
}

/** Which profile (or import) they belong to: another one's are not brought back. */
export function profileKey(usernames: ProfileSearch): string {
  return usernames.import
    ? 'import'
    : `lichess:${usernames.lichess ?? ''}|chesscom:${usernames.chesscom ?? ''}`
}

function load<T>(key: string, profile: string, storage: Storage): T | undefined {
  try {
    const raw = storage.getItem(key)
    if (!raw) return undefined
    // Dates come back as strings: the games' dates are dates again.
    const saved = JSON.parse(raw, (name, value: unknown) =>
      name === 'playedAt' && typeof value === 'string' ? new Date(value) : value,
    ) as { profile?: unknown; value?: T }
    return saved.profile === profile ? saved.value : undefined
  } catch {
    return undefined
  }
}

function save(key: string, profile: string, value: unknown, storage: Storage) {
  try {
    if (value === undefined) {
      // Only its own: another profile's (open in another tab) stays.
      const saved = JSON.parse(storage.getItem(key) ?? 'null') as { profile?: unknown } | null
      if (!saved || saved.profile === profile) storage.removeItem(key)
    } else storage.setItem(key, JSON.stringify({ profile, value }))
  } catch {
    // Storage refused or full: a reload simply starts over.
  }
}

export function loadOpenAnalysis(
  profile: string,
  storage: Storage = localStorage,
): SavedAnalysis | undefined {
  const saved = load<SavedAnalysis>(ANALYSIS_KEY, profile, storage)
  // Saved before the option existed: its default.
  return (
    saved && {
      ...saved,
      settings: { ...saved.settings, autoDeepen: saved.settings.autoDeepen ?? defaultAutoDeepen() },
    }
  )
}

/** undefined: the analysis is closed. */
export function saveOpenAnalysis(
  profile: string,
  analysis: SavedAnalysis | undefined,
  storage: Storage = localStorage,
) {
  save(ANALYSIS_KEY, profile, analysis, storage)
}

export function loadOpenTraining(
  profile: string,
  storage: Storage = localStorage,
): OpenTraining | undefined {
  return load<OpenTraining>(TRAINING_KEY, profile, storage)
}

/** undefined: the training is closed. */
export function saveOpenTraining(
  profile: string,
  training: OpenTraining | undefined,
  storage: Storage = localStorage,
) {
  save(TRAINING_KEY, profile, training, storage)
}

/**
 * A training launched and not over: kept when its page is left (to study a position, look at the
 * profile…), to come back to it. One on its options, or finished, closes with its page.
 */
export function trainingUnderWay(training: OpenTraining | undefined): training is OpenTraining {
  return training?.phase.kind === 'running' && !training.finished
}

/** Under way with positions played: replacing it loses them, so it asks first. */
export function trainingStarted(training: OpenTraining | undefined): training is OpenTraining {
  return trainingUnderWay(training) && (training.progress?.index ?? 0) > 0
}

/** Where a training under way stands: the position to play, out of how many. */
export function trainingCount(
  training: OpenTraining | undefined,
): { current: number; total: number } | undefined {
  if (!trainingUnderWay(training) || training.phase.kind !== 'running') return undefined
  const total = training.phase.puzzles.length
  return { current: Math.min((training.progress?.index ?? 0) + 1, total), total }
}
