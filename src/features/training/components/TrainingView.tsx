import type { Config } from '@lichess-org/chessground/config'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react'
import { Board } from '@/components/board/Board'
import type { Mistake } from '@/features/review/analyze'
import { VALID_MAX_DROP } from '@/features/review/errors'
import { formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'
import { Coach, validMovesOf } from '../coach'
import { ValidMaxDropContext } from '../criteria'
import {
  boardMoveToUci,
  isCheck,
  legalDests,
  moveSquares,
  play,
  positionFromFen,
  sameMove,
} from '../moves'
import {
  currentPuzzle,
  missedPuzzles,
  startTraining,
  trainingReducer,
  type TrainingState,
} from '../session'
import type { Exercise } from '../settings'
import { TrainingProgress } from './TrainingProgress'
import { PuzzlePanel } from './PuzzlePanel'
import { TrainingSummary } from './TrainingSummary'
import { SIDE_BY_SIDE, useBoardSize } from '../useBoardSize'

const squares = (uci: string) => moveSquares(uci) as [Key, Key]
const arrow = (uci: string, brush: string): DrawShape => {
  const [orig, dest] = squares(uci)
  return { orig, dest, brush }
}

/**
 * What the board shows. Before the position is solved, the player's tried move stays on the
 * board, with the engine's reply in red after a miss. Once solved (even with the best move) or
 * once the solution is shown, the board goes back to the position with arrows: the game's move
 * (red), always, to compare; the best move (green); theirs (blue), unless it is the best.
 */
function boardView(state: TrainingState, puzzle: Mistake) {
  const { status, tried, best } = state
  const triedIsBest = Boolean(tried && best && sameMove(puzzle.fen, tried, best))
  const showsTried = tried !== undefined && (status === 'checking' || status === 'wrong')
  if (showsTried) {
    // A miss shows how it gets punished: the engine's reply, in red.
    const punishment = status === 'wrong' && state.triedReply
    return {
      fen: play(puzzle.fen, tried).fen,
      lastMove: tried,
      shapes: punishment ? [arrow(punishment, 'red')] : [],
    }
  }

  const shapes: DrawShape[] = []
  if (status === 'solved' || status === 'revealed') {
    shapes.push(arrow(puzzle.played.uci, 'red'))
    if (tried && !triedIsBest) shapes.push(arrow(tried, 'blue'))
    if (best) shapes.push(arrow(best, 'green'))
  }
  return { fen: puzzle.fen, lastMove: puzzle.lastMove, shapes }
}

function bringBoard(board: HTMLElement | null) {
  if (window.matchMedia(SIDE_BY_SIDE).matches) window.scrollTo({ top: 0, behavior: 'smooth' })
  else board?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/**
 * Replays the player's errors one by one, in random order, then shows a summary.
 * `validMaxDrop`: the valid-move threshold of the review (see isValidMove).
 */
export function TrainingView({
  puzzles,
  exercises,
  validMaxDrop = VALID_MAX_DROP,
  active = true,
  onFinishedChange,
  onRestart,
  onReplayMissed,
  onExit,
}: {
  /** The positions to replay, in this order (see trainingPuzzles) */
  puzzles: Mistake[]
  /** What to do on each position; only "replay" when omitted */
  exercises?: Exercise[]
  validMaxDrop?: number
  /** The training is on screen (its tab is shown) */
  active?: boolean
  /** Every position has been played (or not anymore) */
  onFinishedChange?: (finished: boolean) => void
  /** The same training again, from the summary */
  onRestart?: () => void
  /** The positions whose move was missed at first, again, from the summary */
  onReplayMissed?: (puzzles: Mistake[]) => void
  /** Back to the analysis results, from the summary */
  onExit: () => void
}) {
  const [state, dispatch] = useReducer(trainingReducer, { puzzles, exercises }, (initial) =>
    startTraining(initial.puzzles, initial.exercises),
  )
  const [engineFailed, setEngineFailed] = useState(false)
  const [coach] = useState(() => new Coach(validMaxDrop))
  const layoutRef = useRef<HTMLDivElement>(null)
  const boardSize = useBoardSize(layoutRef)
  const boardRef = useRef<HTMLDivElement>(null)
  const puzzle = currentPuzzle(state)

  // The board back on screen in full: on a phone, at the top of the screen, the feedback right
  // below it; on a computer, the page scrolled to the top, which the board's size is computed for.
  // Arriving on the tab (or a new training), whatever the puzzle's state. The navigations to it
  // keep the scroll position (`resetScroll: false`), so the router does not undo this.
  useEffect(() => {
    if (active) bringBoard(boardRef.current)
  }, [active])
  // On the tab, whenever the board waits for a move or an evaluation again: next mistake, retry,
  // explore, part 2. Not after a move: the feedback shows right below the board.
  useEffect(() => {
    if (active && (state.status === 'thinking' || state.status === 'evaluating')) {
      bringBoard(boardRef.current)
    }
  }, [active, state.index, state.status])

  // Told only when it changes (the callback may be a new function on every render).
  const finished = state.status === 'summary'
  const tellFinished = useEffectEvent((value: boolean) => onFinishedChange?.(value))
  useEffect(() => {
    tellFinished(finished)
  }, [finished])

  // The engine only runs while the training is on screen and not over: several trainings may be
  // open. Hidden, it is stopped (searches under way are dropped) and starts again once shown. On
  // the summary, every result is in: stopped too, so the background analysis starts again.
  useEffect(() => {
    if (!active || finished) return
    coach.activate()
    return () => coach.terminate()
  }, [coach, active, finished])

  // Look for the best move while the player thinks (again if the training was hidden meanwhile).
  const hasBest = state.best !== undefined
  useEffect(() => {
    if (!puzzle || !active || hasBest) return
    let current = true
    coach.reference(puzzle).then(
      (reference) => {
        const valid = validMovesOf(reference, puzzle, validMaxDrop)
        dispatch({
          type: 'best',
          puzzleId: puzzle.id,
          uci: reference.bestMove,
          cp: reference.bestCp,
          validMoves: valid.moves,
          validCapped: valid.capped,
        })
      },
      (error: unknown) => {
        if (!current) return
        console.error('Training: reference search failed', error)
        setEngineFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [coach, puzzle, validMaxDrop, active, hasBest])

  // Judge the move tried (again if the training was hidden while it was being checked).
  const { status, tried } = state
  useEffect(() => {
    if (!puzzle || !active || status !== 'checking' || !tried) return
    let current = true
    coach.check(puzzle, tried).then(
      ({ valid, afterCp, reply }) =>
        dispatch({ type: 'verdict', puzzleId: puzzle.id, valid, afterCp, reply }),
      (error: unknown) => {
        if (!current) return
        console.error('Training: move check failed', error)
        setEngineFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [coach, puzzle, active, status, tried])

  const config = useMemo((): Config | undefined => {
    if (!puzzle) return undefined
    const { fen, lastMove, shapes } = boardView(state, puzzle)
    const thinking = state.status === 'thinking'
    const turn = positionFromFen(fen).turn
    return {
      fen,
      orientation: puzzle.color,
      turnColor: turn,
      check: isCheck(fen) ? turn : false,
      lastMove: lastMove ? squares(lastMove) : undefined,
      movable: {
        free: false,
        color: thinking ? puzzle.color : undefined,
        dests: thinking ? legalDests(fen) : new Map(),
        events: {
          after: (orig, dest) => {
            dispatch({ type: 'try', uci: boardMoveToUci(puzzle.fen, orig, dest) })
          },
        },
      },
      premovable: { enabled: false },
      drawable: { autoShapes: shapes },
    }
  }, [state, puzzle])

  if (!puzzle || !config) {
    return (
      <TrainingSummary
        results={state.replay ? state.results : undefined}
        assessments={state.evaluate ? state.assessments : undefined}
        missed={state.replay ? missedPuzzles(state) : []}
        onReplayMissed={onReplayMissed}
        onRestart={onRestart}
        onFinish={onExit}
      />
    )
  }

  const remaining = state.puzzles.length - state.index
  return (
    // On a computer, as large as the window and the page's column allow (see useBoardSize), the
    // panel centered vertically next to it. On a phone, at least a screen high, so that the page
    // can always scroll the board up to the top of the screen.
    <div
      ref={layoutRef}
      className="flex min-h-dvh flex-col gap-6 md:min-h-0 md:flex-row md:items-center md:justify-center"
    >
      <div
        ref={boardRef}
        className="mx-auto w-full max-w-[32rem] scroll-mt-2 md:mx-0 md:max-w-none"
        style={{ width: boardSize }}
      >
        {/* Only the training on screen has a board: chessground's arrowheads are SVG markers with
            page-wide ids, which would resolve to a hidden board's (and not show). The board is
            rebuilt from the training's state when its tab is shown again. */}
        {active ? (
          <Board config={config} className="rounded-sm" />
        ) : (
          <div className="aspect-square w-full" />
        )}
      </div>
      <div className="flex flex-col gap-5 md:w-80 md:shrink-0">
        <div className="space-y-2">
          <p className="flex items-baseline justify-between gap-2 tabular-nums">
            <span className="font-medium text-text-strong">
              {m.training_progress({
                current: formatNumber(state.index + 1),
                total: formatNumber(state.puzzles.length),
              })}
            </span>
            <span className="text-sm text-muted-foreground">
              {m.training_remaining({ count: remaining, formatted: formatNumber(remaining) })}
            </span>
          </p>
          <TrainingProgress
            total={state.puzzles.length}
            done={state.index}
            label={m.training_progress({
              current: formatNumber(state.index + 1),
              total: formatNumber(state.puzzles.length),
            })}
          />
        </div>
        {engineFailed ? (
          <p className="text-loss">{m.training_engine_failed()}</p>
        ) : (
          <ValidMaxDropContext value={validMaxDrop}>
            <PuzzlePanel state={state} puzzle={puzzle} dispatch={dispatch} />
          </ValidMaxDropContext>
        )}
      </div>
    </div>
  )
}
