import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProfileSearch } from '@/features/player/search'
import { useConfirm } from '@/hooks/useConfirm'
import { useKeepAwake } from '@/hooks/useKeepAwake'
import { beginActivity, waitForOthers, watchOthers, withActivity } from '@/lib/activity'
import { trainingPuzzles } from '@/features/training/order'
import type { TrainingProgress } from '@/features/training/session'
import {
  DEFAULT_TRAINING_SETTINGS,
  saveTrainingSettings,
  toTrainingOptions,
  type TrainingSettings,
} from '@/features/training/settings'
import { m } from '@/paraglide/messages'
import {
  analyzeGames,
  deepenGame,
  shallowPositions,
  withDeepPosition,
  type Mistake,
} from './analyze'
import { DEFAULT_CRITERIA, type ReviewCriteria } from './criteria'
import type { FoundGames, ReviewAccount } from './fetch'
import type { GameLibrary } from './library'
import { gameRef as refOf, parseGameRef } from './gameRef'
import {
  loadOpenAnalysis,
  loadOpenTraining,
  profileKey,
  saveOpenAnalysis,
  saveOpenTraining,
} from './openSession'
import { defaultSelection } from './selection'
import {
  loadReviewSettings,
  sameSelection,
  saveReviewSettings,
  type ReviewSettings,
} from './settings'
import {
  SessionContext,
  type AnalysisState,
  type SearchState,
  reviewedGameKey,
  type Deepening,
  type AnalysisView,
  type GameListView,
  type OpenTraining,
  type Session,
  ANALYSIS_PAGES,
  TRAINING_PAGE,
} from './sessionContext'

/** The quick review: the last game (or the one picked in the history), default rules. */
function quickSettings(library: GameLibrary): ReviewSettings {
  return {
    selection: {
      ...defaultSelection(library.sources),
      scope: { kind: 'latest', count: 1 },
    },
    criteria: DEFAULT_CRITERIA,
  }
}

/**
 * Holds the analysis state of a profile, shared by its pages: the analysis page (filters, then the
 * analysis and its results), the training page, a game's review. A search, an analysis and a
 * training are independent: the user can look for other games while an analysis runs.
 *
 * The analysis stays open while the player is on its pages (analysis, training, review), and closes
 * once they leave them; the training, one at a time, closes when its page is left. Both are kept in
 * this browser while open (openSession.ts), so that reloading the page brings them back.
 *
 * A link with `start="last"` starts the quick review, one with `game` the review of that game
 * (with `train`, then its training): on arrival, or later from inside the page.
 */
export function AnalysisSessionProvider({
  accounts,
  library,
  gameTotal,
  usernames,
  start,
  game,
  train,
  children,
}: {
  /** The accounts searched (none for imported games): the filters' platforms */
  accounts: ReviewAccount[]
  /** Where the games come from: the accounts, or imported games */
  library: GameLibrary
  /** Games played on all the accounts, an indication */
  gameTotal: number
  /** The accounts in the URL, kept when switching tabs */
  usernames: ProfileSearch
  start?: 'last'
  /** A game reference (gameRef.ts), as in the URL */
  game?: string
  /** With `game`: open the training of its mistakes as soon as it is analysed */
  train?: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const sources = library.sources
  // The quick review is "running" from the first render, so the analysis tab never thinks there
  // is nothing to show (children's effects run before ours).
  const gameRef = useMemo(() => parseGameRef(game), [game])
  const quick = start === 'last' ? 'last' : gameRef ? game : undefined
  const [initialQuick] = useState(() => (quick ? quickSettings(library) : undefined))
  const [draft, setDraftState] = useState<ReviewSettings>(
    // Imported games start from all of them: the filters saved are the accounts' ones.
    () =>
      initialQuick ??
      (library.kind === 'import'
        ? { selection: defaultSelection(sources), criteria: DEFAULT_CRITERIA }
        : loadReviewSettings(accounts.map((account) => account.source))),
  )
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [analysis, setAnalysis] = useState<AnalysisState>(() =>
    initialQuick
      ? {
          status: 'running',
          progress: { phase: 'fetching' },
          settings: initialQuick,
        }
      : { status: 'none' },
  )
  const profile = profileKey(usernames)
  const pathname = useLocation({ select: (location) => location.pathname })
  const router = useRouter()
  // What was open before a reload, only on the pages it goes with (left meanwhile otherwise).
  const [restored] = useState(() => ({
    analysis: !quick && ANALYSIS_PAGES.includes(pathname) ? loadOpenAnalysis(profile) : undefined,
    training: pathname === TRAINING_PAGE ? loadOpenTraining(profile) : undefined,
  }))
  const [training, setTraining] = useState<OpenTraining | undefined>(restored.training)
  const [gameList, setGameList] = useState<GameListView>({ page: 0 })
  const [view, setView] = useState<(AnalysisView & { analysisId: number }) | undefined>()
  const [analysisId, setAnalysisId] = useState(0)
  const [deepening, setDeepening] = useState<Deepening | undefined>(undefined)
  const deepenJob = useRef<AbortController | undefined>(undefined)
  // The deepening loop reads the latest games, not those of the render it started in.
  const analysisRef = useRef(analysis)
  analysisRef.current = analysis
  const searchJob = useRef<AbortController | undefined>(undefined)
  const analysisJob = useRef<AbortController | undefined>(undefined)
  const analysisCount = useRef(0)
  /** The analysis (analysisId) whose mistakes to train on as soon as it is done */
  const trainOn = useRef<number | undefined>(undefined)
  /** Training restarts, to remount the board each time */
  const runCount = useRef(
    restored.training?.phase.kind === 'running' ? restored.training.phase.run : 0,
  )

  useKeepAwake(analysis.status === 'running' || deepening !== undefined)

  /** Stops the latest search, analysis and deepening, whichever they are by then. */
  const stopAll = () => {
    searchJob.current?.abort()
    analysisJob.current?.abort()
    deepenJob.current?.abort()
  }

  const restart = (job: React.RefObject<AbortController | undefined>) => {
    job.current?.abort()
    job.current = new AbortController()
    return job.current.signal
  }

  /**
   * Runs an analysis, fetching the games first, and replaces any other. Trainings already
   * launched stay, with their own errors (from an older analysis now); those still on their
   * options depended on the replaced one and close.
   */
  const runAnalysis = useCallback(
    async (settings: ReviewSettings, getFound: (signal: AbortSignal) => Promise<FoundGames>) => {
      const signal = restart(analysisJob)
      // A deepening worked on the games being replaced.
      deepenJob.current?.abort()
      setDeepening(undefined)
      analysisCount.current += 1
      setAnalysisId(analysisCount.current)
      setAnalysis({ status: 'running', progress: { phase: 'fetching' }, settings })
      saveOpenAnalysis(profile, { settings })
      try {
        const found = await getFound(signal)
        if (signal.aborted) return
        saveOpenAnalysis(profile, { settings, refs: found.games.map(refOf) })
        const games =
          found.games.length === 0
            ? []
            : await withActivity(() =>
                analyzeGames(found.games, settings.criteria, {
                  signal,
                  onProgress: (progress) => {
                    if (!signal.aborted) {
                      setAnalysis({ status: 'running', progress, settings })
                    }
                  },
                }),
              )
        if (!signal.aborted) {
          setAnalysis({
            status: 'done',
            outcome: { games, failures: found.failures, criteria: settings.criteria },
            settings,
          })
        }
      } catch (error) {
        if (!signal.aborted) {
          setAnalysis({
            status: 'error',
            error: error as Error,
            settings,
          })
        }
      }
    },
    [profile],
  )

  // Stops everything when the page goes away (the provider is remounted for other accounts).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopAll, [])

  // The analysis open before a reload, run again: its games found again by its filters (the
  // store has them), the evaluations from the cache.
  useEffect(() => {
    const saved = restored.analysis
    if (!saved) return
    void runAnalysis(saved.settings, async (signal) => {
      const found = await library.find(saved.settings.selection, signal)
      if (!saved.refs) return found
      const refs = new Set(saved.refs)
      return { ...found, games: found.games.filter((game) => refs.has(refOf(game))) }
    })
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A quick review asked by a link: the last game, or one picked in the games list. Then the
  // request leaves the URL, so that reloading does not start it again. In StrictMode the effect
  // runs twice on arrival: the first review is aborted, the second one runs.
  useEffect(() => {
    if (!quick) return
    const ref = gameRef
    void (async () => {
      // On arrival, the analysis shown as running is this one: nothing to replace.
      const arriving = analysis.status === 'running' && analysis.settings === initialQuick
      if (arriving || (await confirmReplace())) {
        // runAnalysis gives the analysis the next number.
        if (train && ref) trainOn.current = analysisCount.current + 1
        const settings = quickSettings(library)
        void runAnalysis(settings, (signal) =>
          ref ? library.findOne(ref, signal) : library.find(settings.selection, signal),
        )
      }
      // A training asked: its page waits for the analysis. Otherwise, the analysis page.
      void navigate({
        to: train && ref ? TRAINING_PAGE : '/player/analysis',
        search: usernames,
        replace: true,
      })
    })()
    // Once per request: the latest analysis and accounts are the ones to use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick])

  /**
   * Every edit makes the games found stale: the filters tab
   * searches again (rules only change the estimate, not the games).
   */
  const setDraft = useCallback(
    (settings: ReviewSettings) => {
      setDraftState(settings)
      if (search.status === 'finding') {
        searchJob.current?.abort()
        setSearch({ status: 'idle' })
      } else if (
        search.status === 'error' ||
        (search.status === 'found' && !sameSelection(search.selection, settings.selection))
      ) {
        setSearch({ status: 'idle' })
      }
    },
    [search],
  )

  const find = useCallback(() => {
    const { selection } = draft
    const signal = restart(searchJob)
    setSearch({ status: 'finding' })
    library
      .find(selection, signal, (progress) => {
        if (!signal.aborted) setSearch({ status: 'finding', progress })
      })
      .then(
        (found) => {
          if (!signal.aborted) setSearch({ status: 'found', found, selection })
        },
        (error: Error) => {
          if (!signal.aborted) setSearch({ status: 'error', error })
        },
      )
  }, [library, draft])

  /** Starting a new analysis replaces the current one, and the training built on it. */
  const confirmReplace = useCallback(async () => {
    if (analysis.status === 'none') return true
    return confirm({
      icon: RefreshCw,
      title: m.confirm_replace_title(),
      description: m.confirm_replace_body(),
      confirmLabel: m.confirm_replace_action(),
      cancelLabel: m.confirm_cancel(),
    })
  }, [analysis.status, confirm])

  const launch = useCallback(async () => {
    if (search.status !== 'found' || !(await confirmReplace())) return
    const { found, selection } = search
    const settings = { selection, criteria: draft.criteria }
    // Remembered for next time: the settings of the last analysis launched from the filters.
    if (library.kind === 'accounts') saveReviewSettings(settings)
    void runAnalysis(settings, async () => found)
  }, [search, draft.criteria, confirmReplace, runAnalysis, library.kind])

  /**
   * Opens the training page on these errors, on its options or already running; it replaces any
   * training open (there is none: leaving its page closed it). Back where it was opened from.
   */
  const openTraining = useCallback(
    (mistakes: Mistake[], criteria: ReviewCriteria, running: boolean) => {
      runCount.current += 1
      const { location } = router.state
      setTraining({
        mistakes,
        validMaxDrop: criteria.validMaxDrop,
        errorMinDrop: criteria.errorMinDrop,
        phase: running
          ? {
              kind: 'running',
              settings: DEFAULT_TRAINING_SETTINGS,
              puzzles: trainingPuzzles(
                mistakes,
                toTrainingOptions(DEFAULT_TRAINING_SETTINGS, criteria.errorMinDrop),
              ),
              run: runCount.current,
            }
          : { kind: 'options' },
        finished: false,
        from: {
          to: location.pathname === TRAINING_PAGE ? '/player' : location.pathname,
          search: location.search as Record<string, unknown>,
        },
      })
      // The training page places its board itself.
      if (location.pathname !== TRAINING_PAGE) {
        void navigate({ to: TRAINING_PAGE, search: usernames, resetScroll: false })
      }
    },
    [router, navigate, usernames],
  )

  const newTraining = useCallback(() => {
    if (analysis.status !== 'done') return
    openTraining(
      analysis.outcome.games.flatMap((game) => game.mistakes),
      analysis.outcome.criteria,
      false,
    )
  }, [analysis, openTraining])

  const trainGame = useCallback(
    (mistakes: Mistake[], criteria?: ReviewCriteria) => {
      const rules = criteria ?? (analysis.status === 'done' ? analysis.outcome.criteria : undefined)
      openTraining(mistakes, rules ?? draft.criteria, true)
    },
    [analysis, draft.criteria, openTraining],
  )

  // A game opened to train on: its training as soon as its analysis (from the cache, at once) is
  // done. Without mistakes, its analysis instead.
  useEffect(() => {
    if (analysis.status !== 'done' || trainOn.current !== analysisId) return
    trainOn.current = undefined
    const mistakes = analysis.outcome.games.flatMap((item) => item.mistakes)
    if (mistakes.length > 0) trainGame(mistakes)
    else void navigate({ to: '/player/analysis', search: usernames, replace: true })
  }, [analysis, analysisId, trainGame, navigate, usernames])

  const updateTraining = useCallback(
    (change: (training: OpenTraining) => OpenTraining) =>
      setTraining((current) => current && change(current)),
    [],
  )

  const launchTraining = useCallback(
    (settings: TrainingSettings) => {
      saveTrainingSettings(settings)
      runCount.current += 1
      const run = runCount.current
      updateTraining((current) => ({
        ...current,
        phase: {
          kind: 'running',
          settings,
          puzzles: trainingPuzzles(
            current.mistakes,
            toTrainingOptions(settings, current.errorMinDrop),
          ),
          run,
        },
        finished: false,
        progress: undefined,
      }))
    },
    [updateTraining],
  )

  const restartTraining = useCallback(() => {
    runCount.current += 1
    const run = runCount.current
    updateTraining((current) =>
      current.phase.kind === 'running'
        ? {
            ...current,
            phase: {
              ...current.phase,
              puzzles: trainingPuzzles(
                current.mistakes,
                toTrainingOptions(current.phase.settings, current.errorMinDrop),
              ),
              run,
              exercises: undefined,
            },
            finished: false,
            progress: undefined,
          }
        : current,
    )
  }, [updateTraining])

  const replayMissed = useCallback(
    (puzzles: Mistake[]) => {
      runCount.current += 1
      const run = runCount.current
      updateTraining((current) =>
        current.phase.kind === 'running'
          ? {
              ...current,
              phase: { ...current.phase, puzzles, run, exercises: ['replay'] },
              finished: false,
              progress: undefined,
            }
          : current,
      )
    },
    [updateTraining],
  )

  const setTrainingFinished = useCallback(
    (finished: boolean) =>
      setTraining((current) =>
        current && current.finished !== finished ? { ...current, finished } : current,
      ),
    [],
  )

  const setTrainingProgress = useCallback(
    (progress: TrainingProgress) => updateTraining((current) => ({ ...current, progress })),
    [updateTraining],
  )

  /**
   * Back where the training was opened: the browser's previous page when there is one in the app,
   * its origin otherwise (after a reload). The page left, the training closes (see below); one
   * under way asks first (LeaveGuard).
   */
  const leaveTraining = useCallback(() => {
    if (router.history.canGoBack()) router.history.back()
    else if (training) {
      // Its origin is one of the profile's pages, kept as a plain path.
      void navigate({
        to: training.from.to,
        search: training.from.search,
        replace: true,
      } as unknown as Parameters<typeof navigate>[0])
    } else void navigate({ to: '/player', search: usernames, replace: true })
  }, [router, training, navigate, usernames])

  /** Stops the analysis under way and drops it: back to the filters, to change them. */
  const stopAnalysis = useCallback(() => {
    analysisJob.current?.abort()
    deepenJob.current?.abort()
    setDeepening(undefined)
    setAnalysis({ status: 'none' })
    saveOpenAnalysis(profile, undefined)
  }, [profile])

  /**
   * Deepens these games one after the other. It holds an activity (the background analysis waits)
   * but gives way to any other use of Stockfish (a training, here or in another tab): it stops its
   * engines, shows that it is paused, and goes on a few seconds after the last one ends. What was
   * evaluated stays: it resumes with the positions left.
   */
  const deepenGames = useCallback(async (gameKeys: string[], scope: Deepening['scope']) => {
    const signal = restart(deepenJob)
    const endActivity = beginActivity()
    signal.addEventListener('abort', endActivity, { once: true })
    const latest = (gameKey: string) => {
      const current = analysisRef.current
      return current.status === 'done'
        ? current.outcome.games.find((item) => reviewedGameKey(item) === gameKey)
        : undefined
    }
    games: for (const [position, gameKey] of gameKeys.entries()) {
      const first = latest(gameKey)
      if (signal.aborted || !first) break
      const total = shallowPositions(first).length
      if (total === 0) continue
      const gamesLeft = gameKeys.length - position - 1
      while (!signal.aborted) {
        // The positions deepened before a pause are precise now: only the others are left.
        const game = latest(gameKey)
        const left = game ? shallowPositions(game).length : 0
        if (!game || left === 0) break
        setDeepening({ scope, gameKey, done: total - left, total, gamesLeft, paused: false })
        const criteria =
          analysisRef.current.status === 'done' ? analysisRef.current.outcome.criteria : undefined
        const yielded = new AbortController()
        const stopWatching = watchOthers(() => yielded.abort())
        try {
          await deepenGame(game, {
            signal: AbortSignal.any([signal, yielded.signal]),
            onPosition: (index, cp) => {
              setAnalysis((state) =>
                state.status === 'done'
                  ? {
                      ...state,
                      outcome: {
                        ...state.outcome,
                        games: state.outcome.games.map((item) =>
                          reviewedGameKey(item) === gameKey && criteria
                            ? withDeepPosition(item, index, cp, criteria)
                            : item,
                        ),
                      },
                    }
                  : state,
              )
              setDeepening((state) =>
                state?.gameKey === gameKey ? { ...state, done: state.done + 1 } : state,
              )
            },
          })
        } catch (error) {
          if (!signal.aborted && !yielded.signal.aborted) {
            console.error('Deepening failed', error)
            break games
          }
        } finally {
          stopWatching()
        }
        if (signal.aborted || !yielded.signal.aborted) break
        // Another use of Stockfish: wait for it to end, then go on with this game.
        setDeepening((state) => (state ? { ...state, paused: true } : state))
        await waitForOthers(signal)
      }
    }
    endActivity()
    if (!signal.aborted) setDeepening(undefined)
  }, [])

  // Once an analysis is done, its games are deepened at once (each analysis once: stopping the
  // deepening is for good).
  const autoDeepened = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (analysis.status !== 'done' || autoDeepened.current === analysisId) return
    autoDeepened.current = analysisId
    const pending = analysis.outcome.games.filter((game) => shallowPositions(game).length > 0)
    if (pending.length > 0) void deepenGames(pending.map(reviewedGameKey), 'all')
  }, [analysis, analysisId, deepenGames])

  const stopDeepening = useCallback(() => {
    deepenJob.current?.abort()
    setDeepening(undefined)
  }, [])

  // Leaving the training's page closes it; leaving the analysis's pages closes the analysis (the
  // player was asked first while it ran: LeaveGuard).
  useEffect(() => {
    if (pathname !== TRAINING_PAGE) setTraining(undefined)
    if (!ANALYSIS_PAGES.includes(pathname) && analysisRef.current.status !== 'none' && !quick) {
      analysisJob.current?.abort()
      deepenJob.current?.abort()
      setDeepening(undefined)
      setAnalysis({ status: 'none' })
      saveOpenAnalysis(profile, undefined)
    }
    // Only when the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // The training open is kept for a reload, as it goes.
  useEffect(() => saveOpenTraining(profile, training), [profile, training])

  const analysisSettings = analysis.status === 'none' ? undefined : analysis.settings

  const value: Session = {
    accounts,
    usernames,
    library,
    gameTotal,
    draft,
    setDraft,
    search,
    analysis,
    analysisId,
    training,
    trainingPending: trainOn.current !== undefined,
    analysisSettings,
    find,
    launch,
    newTraining,
    trainGame,
    launchTraining,
    restartTraining,
    replayMissed,
    setTrainingFinished,
    setTrainingProgress,
    leaveTraining,
    stopAnalysis,
    gameList,
    setGameList,
    // Only while that analysis is open: closed, the page starts afresh (its options open).
    analysisView: view?.analysisId === analysisId && analysis.status !== 'none' ? view : undefined,
    updateAnalysisView: (change) =>
      setView((current) => ({
        ...(current?.analysisId === analysisId
          ? current
          : { analysisId, page: 0, optionsOpen: false }),
        ...change,
      })),
    deepening,
    deepenGames: (keys, scope) => void deepenGames(keys, scope),
    stopDeepening,
  }

  return (
    <SessionContext value={value}>
      {children}
      {dialog}
    </SessionContext>
  )
}
