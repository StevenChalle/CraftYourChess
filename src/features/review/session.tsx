import { useNavigate, useRouter } from '@tanstack/react-router'
import { CircleX, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ProfileSearch } from '@/features/player/search'
import { useConfirm } from '@/hooks/useConfirm'
import { useKeepAwake } from '@/hooks/useKeepAwake'
import { beginActivity, waitForOthers, watchOthers, withActivity } from '@/lib/activity'
import { trainingPuzzles } from '@/features/training/order'
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
import { parseGameRef } from './gameRef'
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
  freeNumber,
  reviewedGameKey,
  type Deepening,
  type Session,
  type TrainingTab,
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
 * Holds the analysis state of the profile page, shared by its tabs (analysis filters, results,
 * trainings) so switching tabs loses nothing. A search, an analysis and a training session are
 * independent: the user can look for other games while an analysis runs. Leaving the page drops
 * everything (nothing is saved). A link with `start="last"` starts the quick review, one with
 * `game` the review of that game: on arrival, or later from inside the page.
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
  const [trainings, setTrainings] = useState<TrainingTab[]>([])
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
  const runCount = useRef(0)
  const router = useRouter()

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
      setTrainings((tabs) => tabs.filter((tab) => tab.phase.kind === 'running'))
      setAnalysis({ status: 'running', progress: { phase: 'fetching' }, settings })
      try {
        const found = await getFound(signal)
        if (signal.aborted) return
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
    [],
  )

  // Stops everything when the page goes away (the provider is remounted for other accounts).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopAll, [])

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
      void navigate({ to: '/player/results', search: usernames, replace: true })
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

  // Like the tabs, keeps the scroll position: the training tab places its board itself.
  const goTo = useCallback(
    (to: '/player/results') => void navigate({ to, search: usernames, resetScroll: false }),
    [navigate, usernames],
  )

  const launch = useCallback(async () => {
    if (search.status !== 'found' || !(await confirmReplace())) return
    const { found, selection } = search
    const settings = { selection, criteria: draft.criteria }
    // Remembered for next time: the settings of the last analysis launched from the filters.
    if (library.kind === 'accounts') saveReviewSettings(settings)
    void runAnalysis(settings, async () => found)
    goTo('/player/results')
  }, [search, draft.criteria, confirmReplace, runAnalysis, goTo, library.kind])

  const showTraining = useCallback(
    (number: number) =>
      void navigate({
        to: '/player/training/$number',
        params: { number: String(number) },
        search: usernames,
        resetScroll: false,
      }),
    [navigate, usernames],
  )

  /**
   * A new tab on these errors, on its options or already running, judged with `criteria`: those of
   * the current analysis by default.
   */
  const openTraining = useCallback(
    (mistakes: Mistake[], running: boolean, judgedWith?: ReviewCriteria) => {
      const criteria =
        judgedWith ?? (analysis.status === 'done' ? analysis.outcome.criteria : undefined)
      if (!criteria) return
      runCount.current += 1
      const tab: TrainingTab = {
        number: freeNumber(trainings),
        analysisId,
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
      }
      setTrainings((tabs) => [...tabs, tab])
      showTraining(tab.number)
    },
    [analysis, analysisId, trainings, showTraining],
  )

  const newTraining = useCallback(() => {
    if (analysis.status !== 'done') return
    openTraining(
      analysis.outcome.games.flatMap((game) => game.mistakes),
      false,
    )
  }, [analysis, openTraining])

  const trainGame = useCallback(
    (mistakes: Mistake[]) => openTraining(mistakes, true),
    [openTraining],
  )

  const trainMistakes = useCallback(
    (mistakes: Mistake[], criteria: ReviewCriteria) => openTraining(mistakes, true, criteria),
    [openTraining],
  )

  // A game opened to train on: its training as soon as its analysis (from the cache, at once) is
  // done; the results stay if it has no mistakes.
  useEffect(() => {
    if (analysis.status !== 'done' || trainOn.current !== analysisId) return
    trainOn.current = undefined
    const mistakes = analysis.outcome.games.flatMap((item) => item.mistakes)
    if (mistakes.length > 0) trainGame(mistakes)
  }, [analysis, analysisId, trainGame])

  const updateTraining = useCallback(
    (number: number, change: (tab: TrainingTab) => TrainingTab) =>
      setTrainings((tabs) => tabs.map((tab) => (tab.number === number ? change(tab) : tab))),
    [],
  )

  const launchTraining = useCallback(
    (number: number, settings: TrainingSettings) => {
      saveTrainingSettings(settings)
      runCount.current += 1
      const run = runCount.current
      updateTraining(number, (tab) => ({
        ...tab,
        phase: {
          kind: 'running',
          settings,
          puzzles: trainingPuzzles(tab.mistakes, toTrainingOptions(settings, tab.errorMinDrop)),
          run,
        },
        finished: false,
      }))
    },
    [updateTraining],
  )

  const restartTraining = useCallback(
    (number: number) => {
      runCount.current += 1
      const run = runCount.current
      updateTraining(number, (tab) =>
        tab.phase.kind === 'running'
          ? {
              ...tab,
              phase: {
                ...tab.phase,
                puzzles: trainingPuzzles(
                  tab.mistakes,
                  toTrainingOptions(tab.phase.settings, tab.errorMinDrop),
                ),
                run,
                exercises: undefined,
              },
              finished: false,
            }
          : tab,
      )
    },
    [updateTraining],
  )

  const replayMissed = useCallback(
    (number: number, puzzles: Mistake[]) => {
      runCount.current += 1
      const run = runCount.current
      updateTraining(number, (tab) =>
        tab.phase.kind === 'running'
          ? {
              ...tab,
              phase: { ...tab.phase, puzzles, run, exercises: ['replay'] },
              finished: false,
            }
          : tab,
      )
    },
    [updateTraining],
  )

  const setTrainingFinished = useCallback((number: number, finished: boolean) => {
    setTrainings((tabs) =>
      tabs.some((tab) => tab.number === number && tab.finished !== finished)
        ? tabs.map((tab) => (tab.number === number ? { ...tab, finished } : tab))
        : tabs,
    )
  }, [])

  const showResults = useCallback(() => goTo('/player/results'), [goTo])

  /** Stops the analysis under way and drops it: back to the filters, to change them. */
  const stopAnalysis = useCallback(() => {
    analysisJob.current?.abort()
    deepenJob.current?.abort()
    setDeepening(undefined)
    setAnalysis({ status: 'none' })
    void navigate({ to: '/player/analysis', search: usernames, resetScroll: false })
  }, [navigate, usernames])

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

  /** Closing the tab on screen shows its neighbor, else the results (or the filters). */
  const closeTraining = useCallback(
    async (number: number) => {
      const index = trainings.findIndex((tab) => tab.number === number)
      const tab = trainings[index]
      if (!tab) return
      // Only a training under way has something to lose (not its options, nor once finished).
      if (
        tab.phase.kind === 'running' &&
        !tab.finished &&
        !(await confirm({
          icon: CircleX,
          title: m.confirm_close_training_title(),
          description: m.confirm_close_training_body(),
          confirmLabel: m.confirm_close_training_action(),
          cancelLabel: m.confirm_cancel(),
        }))
      ) {
        return
      }
      // Leave the tab first: without its training, it would redirect elsewhere.
      const shown = router.state.location.pathname === `/player/training/${number}`
      const neighbor = trainings[index + 1] ?? trainings[index - 1]
      const leave = !shown
        ? Promise.resolve()
        : neighbor
          ? navigate({
              to: '/player/training/$number',
              params: { number: String(neighbor.number) },
              search: usernames,
              resetScroll: false,
            })
          : navigate({
              to: analysis.status === 'none' ? '/player/analysis' : '/player/results',
              search: usernames,
              resetScroll: false,
            })
      void leave.then(() => setTrainings((tabs) => tabs.filter((item) => item.number !== number)))
    },
    [trainings, confirm, router, analysis.status, navigate, usernames],
  )

  const analysisSettings = analysis.status === 'none' ? undefined : analysis.settings

  const value: Session = {
    accounts,
    library,
    gameTotal,
    draft,
    setDraft,
    search,
    analysis,
    analysisId,
    trainings,
    analysisSettings,
    find,
    launch,
    newTraining,
    trainGame,
    trainMistakes,
    launchTraining,
    restartTraining,
    replayMissed,
    closeTraining,
    setTrainingFinished,
    showResults,
    stopAnalysis,
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
