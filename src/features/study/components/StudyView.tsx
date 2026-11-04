import { useNavigate } from '@tanstack/react-router'
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Microscope,
  Repeat,
  Swords,
  Trash2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ProfileSearch } from '@/features/player/search'
import {
  analyzeGames,
  deepenGame,
  shallowPositions,
  withDeepPosition,
  type ReviewedGame,
} from '@/features/review/analyze'
import { EvalChart } from '@/features/review/components/EvalChart'
import type { WhiteScore } from '@/features/review/errors'
import type { Color } from 'chessops'
import { gameRef } from '@/features/review/gameRef'
import { clocksAt, type ReviewGame } from '@/features/review/games'
import type { ReviewProgress } from '@/features/review/progress'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { useCachedReviews } from '@/features/review/useCachedReviews'
import { SIDE_BY_SIDE, useBoardSize } from '@/features/training/useBoardSize'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { withActivity } from '@/lib/activity'
import { detectDevice } from '@/lib/device'
import { formatClock, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { LIVE_DEPTH, shownLines } from '../liveEngine'
import { gamePly, moveNotes, startStudy, studyReducer, variationStart } from '../study'
import { gameNodeAt, getNode } from '../tree'
import { useLiveAnalysis } from '../useLiveAnalysis'
import { BLACK_CHIP, EngineHeader, EnginePanel, WHITE_CHIP } from './EnginePanel'
import { GameInfo } from './GameInfo'
import { MoveList } from './MoveList'
import { EVAL_BAR, StudyBoard } from './StudyBoard'

/** The side panel's width (w-[22rem]); with the gap before it (gap-6) and the evaluation bar */
const PANEL = 352
const BESIDE = PANEL + 24 + EVAL_BAR
/** The side panel never gets shorter than this, the moves needing room */
const MIN_PANEL_HEIGHT = 520
/** The chart under the board, lower than in the results */
const CHART_HEIGHT = 120
/** Keys that move through the game */
const KEYS: Record<string, 'back' | 'forward' | 'start' | 'end'> = {
  ArrowLeft: 'back',
  ArrowRight: 'forward',
  ArrowUp: 'start',
  Home: 'start',
  ArrowDown: 'end',
  End: 'end',
}

type Work =
  | { kind: 'analysing'; progress?: ReviewProgress }
  | { kind: 'deepening'; done: number; total: number }

type PhoneTab = 'moves' | 'engine' | 'chart' | 'info'

/**
 * A game to study on its own page: the board as large as the training's, the evaluation bar, the
 * live engine and its best lines, the moves with their variations, the evaluation chart. Any move
 * can be played on the board, which makes a variation. The analysis's errors are shown when the
 * game was analysed (from the cache, judged with the analysis's rules), with the training of them;
 * otherwise a button analyses it here. On a phone, the board on top and the rest in tabs.
 */
export function StudyView({
  game,
  ply,
  usernames,
  player,
  back,
}: {
  game: ReviewGame
  /** The game's position to start at */
  ply: number
  usernames: ProfileSearch
  player: string | undefined
  back: ReactNode
}) {
  const ref = gameRef(game)
  const navigate = useNavigate()
  const { draft, trainGame } = useAnalysisSession()
  const criteria = draft.criteria
  const wide = useMediaQuery(SIDE_BY_SIDE)

  const [state, dispatch] = useReducer(studyReducer, undefined, () => startStudy(game, ply))
  const node = getNode(state.tree, state.current)
  const [orientation, setOrientation] = useState(game.color)
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('chart')

  // The analysis: from the cache, or made here (then deepened here).
  const cached = useCachedReviews(
    useMemo(() => [game], [game]),
    criteria,
  )
  const [local, setLocal] = useState<ReviewedGame>()
  const review = local ?? cached.get(ref)
  const notes = useMemo(() => moveNotes(game, review), [game, review])
  const [work, setWork] = useState<Work>()
  const [workFailed, setWorkFailed] = useState(false)
  const job = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => job.current?.abort(), [])

  const analyse = async () => {
    const controller = new AbortController()
    job.current = controller
    setWorkFailed(false)
    setWork({ kind: 'analysing' })
    try {
      const [reviewed] = await withActivity(() =>
        analyzeGames([game], criteria, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (!controller.signal.aborted) setWork({ kind: 'analysing', progress })
          },
        }),
      )
      if (!controller.signal.aborted && reviewed) setLocal(reviewed)
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Study: analysis failed', error)
        setWorkFailed(true)
      }
    } finally {
      if (job.current === controller) {
        job.current = undefined
        setWork(undefined)
      }
    }
  }

  const deepen = async () => {
    if (!review) return
    const controller = new AbortController()
    job.current = controller
    const total = shallowPositions(review).length
    let done = 0
    let current = review
    setWorkFailed(false)
    setWork({ kind: 'deepening', done, total })
    try {
      await withActivity(() =>
        deepenGame(current, {
          signal: controller.signal,
          onPosition: (index, cp) => {
            current = withDeepPosition(current, index, cp, criteria)
            done += 1
            setLocal(current)
            setWork({ kind: 'deepening', done, total })
          },
        }),
      )
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error('Study: deepening failed', error)
        setWorkFailed(true)
      }
    } finally {
      if (job.current === controller) {
        job.current = undefined
        setWork(undefined)
      }
    }
  }

  const stopWork = () => {
    job.current?.abort()
    job.current = undefined
    setWork(undefined)
  }

  // The live engine: on when the page opens on the game's start, off when it opens on a given
  // position (switched on only when wanted); nothing remembered. Paused while the analysis
  // computes here (they would share the processor).
  const [engineOn, setEngineOn] = useState(ply === 0)
  const live = useLiveAnalysis(node.over ? undefined : node.fen, engineOn && !work)
  const lines = useMemo(
    () => (live.analysis ? shownLines(node.fen, node.turn, live.analysis) : []),
    [live.analysis, node.fen, node.turn],
  )
  const analysisCp = node.finalCp ?? (node.inGame ? notes[node.ply]?.cp : undefined)
  // Stockfish off: no evaluation anywhere, the analysis's included (the bar and figure go too).
  const score: WhiteScore | undefined = engineOn
    ? (lines[0]?.score ?? (analysisCp !== undefined ? { cp: analysisCp } : undefined))
    : undefined

  const step = useCallback(
    (direction: 'back' | 'forward' | 'start' | 'end') => dispatch({ type: 'step', direction }),
    [dispatch],
  )
  const play = useCallback((uci: string) => dispatch({ type: 'play', uci }), [dispatch])
  const goto = useCallback((id: string) => dispatch({ type: 'goto', id }), [dispatch])

  // The engine's best move, for the space bar.
  const best = engineOn && !node.over ? lines[0]?.moves[0]?.uci : undefined
  const bestRef = useRef(best)
  useEffect(() => {
    bestRef.current = best
  })

  // Arrows (and Home / End) move through the moves, the space bar plays the engine's best move,
  // F flips the board; not while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const direction = KEYS[event.key]
      if (direction) {
        event.preventDefault()
        step(direction)
      } else if (event.key === ' ') {
        event.preventDefault()
        // Not a click on the button that has the focus (it would be pressed on release).
        if (target?.closest('button')) target.blur()
        if (bestRef.current) play(bestRef.current)
      } else if (event.key === 'f') {
        setOrientation((color) => (color === 'white' ? 'black' : 'white'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, play])

  // The game's move on screen goes in the address (a reload or a shared link comes back to it).
  const shownPly = gamePly(state.tree, state.current)
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void navigate({
          to: '/player/review',
          search: { ...usernames, review: ref, ply: shownPly },
          replace: true,
          resetScroll: false,
        }),
      300,
    )
    return () => clearTimeout(timer)
  }, [navigate, usernames, ref, shownPly])

  // On a phone, the board at the top of the screen on arrival, as in training.
  const phoneBoardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!wide) phoneBoardRef.current?.scrollIntoView({ block: 'start' })
  }, [wide])

  const layoutRef = useRef<HTMLDivElement>(null)
  const boardSize = useBoardSize(layoutRef, BESIDE)
  const variation = variationStart(state.tree, state.current)
  const mistakes = review?.mistakes.length ?? 0
  // Both clocks at the game's move on screen (a variation's: where it leaves the game, dimmed).
  const clocks = game.clock && clocksAt(game.clock, shownPly)
  const top: Color = orientation === 'white' ? 'black' : 'white'

  const board = (
    <StudyBoard
      node={node}
      orientation={orientation}
      score={score}
      evaluation={engineOn}
      arrow={engineOn ? lines[0]?.moves[0]?.uci : undefined}
      onMove={play}
      onWheelStep={step}
    />
  )
  const clock = (color: Color) =>
    clocks && <ClockChip color={color} seconds={clocks[color]} dim={variation !== undefined} />
  // The top player's clock on the left, the bottom one's on the right, the buttons between.
  const controls = (
    <div className="flex items-center gap-2">
      {clock(top)}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1',
          // Between the clocks, in the middle
          clocks && 'justify-center',
        )}
      >
        <ControlButton label={m.study_start()} onClick={() => step('start')}>
          <ChevronFirst />
        </ControlButton>
        <ControlButton label={m.study_back()} onClick={() => step('back')} large>
          <ChevronLeft />
        </ControlButton>
        <ControlButton label={m.study_forward()} onClick={() => step('forward')} large>
          <ChevronRight />
        </ControlButton>
        <ControlButton label={m.study_end()} onClick={() => step('end')}>
          <ChevronLast />
        </ControlButton>
        <ControlButton
          label={m.study_flip()}
          onClick={() => setOrientation((color) => (color === 'white' ? 'black' : 'white'))}
        >
          <Repeat />
        </ControlButton>
        {variation !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            className={cn('text-muted-foreground', !clocks && 'ml-auto')}
            onClick={() => dispatch({ type: 'delete', id: variation })}
            title={m.study_delete_variation()}
          >
            <Trash2 data-icon="inline-start" />
            <span className={clocks ? 'sr-only' : 'max-sm:sr-only'}>
              {m.study_delete_variation_short()}
            </span>
          </Button>
        )}
      </div>
      {clock(orientation)}
    </div>
  )
  const action = (
    <StudyAction
      review={review}
      work={work}
      failed={workFailed}
      mistakes={mistakes}
      onTrain={() => review && trainGame(review.mistakes, criteria)}
      onAnalyse={() => void analyse()}
      onDeepen={() => void deepen()}
      onStop={stopWork}
    />
  )
  const engine = (header: boolean) => (
    <EnginePanel
      header={header}
      on={engineOn}
      onToggle={setEngineOn}
      node={node}
      score={score}
      depth={live.analysis?.depth}
      maxDepth={LIVE_DEPTH[detectDevice()]}
      lines={lines}
      failed={live.failed}
      orientation={orientation}
      onPlay={(moves) => dispatch({ type: 'playLine', moves })}
    />
  )
  const moves = (className?: string) => (
    <MoveList
      tree={state.tree}
      current={state.current}
      notes={notes}
      onSelect={goto}
      className={className}
    />
  )
  const chart = review ? (
    <EvalChart
      game={review}
      selected={shownPly}
      onSelect={(index) => goto(gameNodeAt(state.tree, index))}
      orientation={orientation}
      height={CHART_HEIGHT}
    />
  ) : (
    <p className="text-sm text-muted-foreground">{m.study_chart_unavailable()}</p>
  )

  if (!wide) {
    return (
      <div className="space-y-3">
        {back}
        <div ref={phoneBoardRef} className="scroll-mt-2">
          {board}
        </div>
        {controls}
        {action}
        {/* No room for the engine's panel on arrival: the evaluation and the switch at least */}
        <EngineHeader
          on={engineOn}
          onToggle={setEngineOn}
          node={node}
          score={score}
          depth={live.analysis?.depth}
          maxDepth={LIVE_DEPTH[detectDevice()]}
        />
        <div>
          <nav className="flex gap-6 border-b" aria-label={m.tabs_label()}>
            {(['chart', 'engine', 'moves', 'info'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                data-status={phoneTab === tab ? 'active' : undefined}
                onClick={() => setPhoneTab(tab)}
                className="tab-etabli pb-2.5"
              >
                {PHONE_TABS[tab]()}
              </button>
            ))}
          </nav>
          <div className="pt-3">
            {phoneTab === 'moves' && moves('max-h-80')}
            {phoneTab === 'engine' && engine(false)}
            {phoneTab === 'chart' && chart}
            {phoneTab === 'info' && <GameInfo game={game} player={player} />}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {back}
      <div ref={layoutRef} className="flex items-start justify-center gap-6">
        <div className="min-w-0" style={{ width: boardSize ? boardSize + EVAL_BAR : undefined }}>
          {board}
        </div>
        <aside
          className="panel-etabli flex shrink-0 flex-col gap-3 p-3"
          // As tall as the board, and tall enough for the moves on a short window.
          style={{ width: PANEL, height: boardSize && Math.max(boardSize, MIN_PANEL_HEIGHT) }}
        >
          {engine(true)}
          {moves('-mx-1 min-h-0 flex-1 border-t pt-2')}
          <div className="border-t pt-2">{controls}</div>
          {/* The game itself, at the bottom: its players and opening, the training of its errors */}
          <div className="space-y-3 border-t pt-3">
            <GameInfo game={game} player={player} />
            {action}
          </div>
        </aside>
      </div>
      <div
        className="mx-auto"
        style={{ width: boardSize ? boardSize + EVAL_BAR + 24 + PANEL : undefined }}
      >
        {chart}
      </div>
    </div>
  )
}

const PHONE_TABS: Record<PhoneTab, () => string> = {
  moves: m.study_tab_moves,
  engine: m.study_tab_engine,
  chart: m.study_tab_chart,
  info: m.study_tab_info,
}

/**
 * A player's clock at the move shown, in their color: what they had left, to see the time each
 * move took.
 */
function ClockChip({ color, seconds, dim }: { color: Color; seconds: number; dim: boolean }) {
  const label = color === 'white' ? m.study_clock_white() : m.study_clock_black()
  return (
    <span
      className={cn(
        'num flex h-9 shrink-0 items-center rounded-md border px-2 text-sm font-semibold',
        color === 'white' ? WHITE_CHIP : BLACK_CHIP,
        dim && 'opacity-50',
      )}
      title={label}
      aria-label={`${label} ${formatClock(seconds)}`}
    >
      {formatClock(seconds)}
    </span>
  )
}

function ControlButton({
  label,
  onClick,
  large = false,
  children,
}: {
  label: string
  onClick: () => void
  large?: boolean
  children: ReactNode
}) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(large && 'flex-1 md:flex-none')}
    >
      {children}
    </Button>
  )
}

/**
 * The page's main action: replay the game's errors once it is analysed (with "Deepen" while only
 * quick), analyse it otherwise; the progress while either computes.
 */
function StudyAction({
  review,
  work,
  failed,
  mistakes,
  onTrain,
  onAnalyse,
  onDeepen,
  onStop,
}: {
  review: ReviewedGame | undefined
  work: Work | undefined
  failed: boolean
  mistakes: number
  onTrain: () => void
  onAnalyse: () => void
  onDeepen: () => void
  onStop: () => void
}) {
  if (work) {
    const progress =
      work.kind === 'deepening'
        ? {
            label: m.deepen_running({
              done: formatNumber(work.done),
              total: formatNumber(work.total),
            }),
            value: work.done / Math.max(work.total, 1),
          }
        : work.progress?.phase === 'analysing'
          ? {
              label: m.study_analysing({
                done: formatNumber(work.progress.done),
                total: formatNumber(work.progress.total),
              }),
              value: work.progress.done / Math.max(work.progress.total, 1),
            }
          : { label: m.study_analysis_starting(), value: 0 }
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs text-muted-foreground tabular-nums">{progress.label}</p>
          <Progress value={progress.value * 100} />
        </div>
        <Button variant="ghost" size="sm" onClick={onStop} className="text-muted-foreground">
          {m.deepen_stop()}
        </Button>
      </div>
    )
  }
  if (!review) {
    return (
      <div className="space-y-1">
        <Button onClick={onAnalyse} className="w-full" title={m.study_analyse_hint()}>
          <Microscope data-icon="inline-start" />
          {m.study_analyse()}
        </Button>
        {failed && <p className="text-xs text-loss">{m.review_failed()}</p>}
      </div>
    )
  }
  const shallow = shallowPositions(review).length
  return (
    <div className="flex items-center gap-2">
      {mistakes > 0 ? (
        <Button className="flex-1" onClick={onTrain}>
          <Swords data-icon="inline-start" />
          {m.study_train({ count: mistakes, formatted: formatNumber(mistakes) })}
        </Button>
      ) : (
        <p className="flex-1 text-sm text-win">{m.study_no_mistakes()}</p>
      )}
      {shallow > 0 && (
        <Button variant="outline" onClick={onDeepen} title={m.deepen_hint()}>
          <Microscope data-icon="inline-start" />
          {m.study_deepen()}
        </Button>
      )}
    </div>
  )
}
