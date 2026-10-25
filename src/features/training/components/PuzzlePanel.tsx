import type { Color } from 'chessops'
import { ArrowRight, Check, Lightbulb, LoaderCircle, RotateCcw, Shuffle, X } from 'lucide-react'
import { useState, type PointerEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ExternalLink } from '@/features/player/components/ExternalLink'
import type { Mistake } from '@/features/review/analyze'
import { SideSquare } from '@/features/games/components/GamesTable'
import { forColor, isValidMove } from '@/features/review/errors'
import { useValidMaxDrop } from '../criteria'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { evalDelta, formatDelta, formatEval } from '../evaluation'
import { REFERENCE_LINES } from '../coach'
import { lichessGameUrl, play, sameMove, sanOf } from '../moves'
import { EvaluationPanel } from './EvaluationPanel'
import { MovePreview } from './MovePreview'
import type { TrainingAction, TrainingState } from '../session'

type Tone = 'good' | 'bad' | 'solution'

const TONES: Record<Tone, { box: string; icon: string; title: string }> = {
  good: { box: 'bg-win/12 ring-win/40', icon: 'bg-win', title: 'text-win' },
  bad: { box: 'bg-loss/10 ring-loss/35', icon: 'bg-loss', title: 'text-loss' },
  solution: { box: 'bg-primary/10 ring-primary/35', icon: 'bg-primary', title: 'text-primary' },
}

const APPEAR =
  'animate-in fade-in-0 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none'

/** The outcome of a try: a tinted block with an icon, a short title and the moves. */
function Feedback({
  tone,
  icon,
  title,
  children,
}: {
  tone: Tone
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  const style = TONES[tone]
  return (
    // Denser on a phone, so the verdict, the moves and the buttons fit under the board.
    <div
      className={cn(
        'space-y-3 rounded-md p-4 ring-1 max-md:space-y-2 max-md:p-3',
        style.box,
        APPEAR,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-3 text-xl font-semibold max-md:gap-2 max-md:text-lg',
          style.title,
        )}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-primary-foreground max-md:size-7 [&_svg]:size-5',
            style.icon,
            'animate-in duration-300 ease-out zoom-in-50 motion-reduce:animate-none',
          )}
        >
          {icon}
        </span>
        {title}
      </p>
      {children}
    </div>
  )
}

/** An evaluation, as a small chip. The target of a transition stands out, its origin less. */
function EvalChip({ cp, color, muted }: { cp: number; color: Color; muted?: boolean }) {
  return (
    <span
      className={cn(
        'num rounded-sm px-1.5 py-0.5 text-sm',
        muted
          ? 'bg-background/35 text-muted-foreground'
          : 'bg-background/70 font-medium text-text-strong',
      )}
    >
      {formatEval(forColor(cp, color))}
    </span>
  )
}

/**
 * A move and what it does to the position, under a small title:
 *   Your move
 *   Rb1                  +4.1 → −5.2 (−9.4)
 * the position's evaluation, the evaluation after the move and the change.
 */
function MoveLine({
  label,
  san,
  color,
  cp,
  baseCp,
  showDelta = true,
  preview,
}: {
  label: string
  san: string
  /** The position before the move and the move: hovering it shows the position after */
  preview?: { fen: string; uci: string }
  /** The player's color: evaluations are shown from White's side, as usual in chess */
  color: Color
  /** From the player's side */
  cp?: number
  baseCp?: number
  showDelta?: boolean
}) {
  const validMaxDrop = useValidMaxDrop()
  const delta =
    showDelta && cp !== undefined && baseCp !== undefined
      ? evalDelta(forColor(baseCp, color), forColor(cp, color))
      : undefined
  return (
    // On a phone the label sits on the move's line.
    <div className="space-y-0.5 max-md:flex max-md:items-center max-md:gap-2 max-md:space-y-0">
      <p className="text-sm text-muted-foreground max-md:shrink-0 max-md:text-xs">{label}</p>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 max-md:flex-1">
        {preview ? (
          <MovePreview fen={preview.fen} uci={preview.uci} orientation={color}>
            <span className="cursor-default text-2xl font-semibold text-text-strong max-md:text-lg">
              {san}
            </span>
          </MovePreview>
        ) : (
          <span className="text-2xl font-semibold text-text-strong max-md:text-lg">{san}</span>
        )}
        {cp !== undefined && (
          <span className="ml-auto flex items-center gap-1.5">
            {baseCp !== undefined && (
              <>
                <EvalChip cp={baseCp} color={color} muted />
                <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
              </>
            )}
            <EvalChip cp={cp} color={color} />
            {delta !== undefined && (
              <span
                className={cn(
                  'num text-sm font-medium',
                  isValidMove(baseCp!, cp, validMaxDrop) ? 'text-win' : 'text-loss',
                )}
                title={m.training_delta_title({ eval: formatEval(forColor(baseCp!, color)) })}
              >
                ({formatDelta(delta)})
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

/** Going further: the whole game on Lichess at this position, and the game on its platform. */
function DeeperLinks({ puzzle }: { puzzle: Mistake }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm">
      <ExternalLink href={lichessGameUrl(puzzle.game, puzzle.ply, puzzle.color, puzzle.fen)}>
        {m.training_analyse_lichess()}
      </ExternalLink>
      {puzzle.game.url && (
        <ExternalLink href={puzzle.game.url}>{m.training_view_game()}</ExternalLink>
      )}
    </p>
  )
}

/**
 * "3 valid moves", the list on hover (mouse) or tap (touch): the moves accepted in this position,
 * among the engine's top lines plus any the player found beyond them.
 */
function ValidMoves({ state, puzzle }: { state: TrainingState; puzzle: Mistake }) {
  const [open, setOpen] = useState(false)
  const { validMoves, validCapped, best, tried } = state
  if (!validMoves || validMoves.length === 0) return null
  const count = validMoves.length
  const label = validCapped
    ? m.training_valid_moves_more({ formatted: formatNumber(count) })
    : m.training_valid_moves({ count, formatted: formatNumber(count) })
  const hover = (next: boolean) => (event: PointerEvent) => {
    if (event.pointerType === 'mouse') setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="text-sm text-foreground underline decoration-dotted underline-offset-4 hover:text-text-strong"
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-60"
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      >
        <p className="text-xs text-muted-foreground">{m.training_valid_moves_title()}</p>
        <ul className="space-y-1">
          {validMoves.map((move) => {
            const isBest = best !== undefined && sameMove(puzzle.fen, move.uci, best)
            const isTried = tried !== undefined && sameMove(puzzle.fen, move.uci, tried)
            return (
              <li key={move.uci} className="flex items-center justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  {/* The move just played needs no preview: it is on the board. */}
                  {isTried ? (
                    <span className="font-semibold text-win">{sanOf(puzzle.fen, move.uci)}</span>
                  ) : (
                    <MovePreview fen={puzzle.fen} uci={move.uci} orientation={puzzle.color}>
                      <span className="cursor-default font-semibold text-text-strong">
                        {sanOf(puzzle.fen, move.uci)}
                      </span>
                    </MovePreview>
                  )}
                  {isBest && (
                    <span className="text-xs text-muted-foreground">{m.training_best_tag()}</span>
                  )}
                </span>
                <EvalChip cp={move.cp} color={puzzle.color} />
              </li>
            )
          })}
        </ul>
        {validCapped && (
          <p className="text-xs text-muted-foreground">
            {m.training_valid_moves_more_hint({ count: formatNumber(REFERENCE_LINES) })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Side to move and the task, large: the first thing to read. */
function Prompt({
  puzzle,
  exploring = false,
  evaluating = false,
  positionCp,
}: {
  puzzle: Mistake
  exploring?: boolean
  /** The task is to say how the position stands, not to find a move */
  evaluating?: boolean
  /** Shown once a first try has revealed it: never a hint before that. */
  positionCp?: number
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-3 text-2xl font-semibold text-text-strong">
        <SideSquare color={puzzle.color} className="size-5" />
        {puzzle.color === 'white' ? m.training_white_to_play() : m.training_black_to_play()}
      </p>
      {/* Explanations are left out on phones, for the board and the feedback to fit. */}
      <p className="hidden text-base text-muted-foreground md:block">
        {evaluating
          ? m.training_assess_question()
          : exploring
            ? m.training_explore_hint()
            : m.training_find_move()}
      </p>
      {positionCp !== undefined && (
        <p className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
          {m.training_position_eval()}
          <EvalChip cp={positionCp} color={puzzle.color} />
        </p>
      )}
    </div>
  )
}

type PanelProps = {
  state: TrainingState
  puzzle: Mistake
  dispatch: (action: TrainingAction) => void
}

/**
 * The panel next to the board: the evaluation exercise, then (or only) finding a valid move. With
 * both, a small title says which part the player is in.
 */
export function PuzzlePanel(props: PanelProps) {
  const { state, puzzle, dispatch } = props
  const evaluating = state.status === 'evaluating' || state.status === 'evaluated'
  return (
    <div className="space-y-3 max-md:space-y-2">
      {state.evaluate && state.replay && (
        <p className="label-etabli text-muted-foreground">
          {evaluating ? m.training_part_evaluation() : m.training_part_move()}
        </p>
      )}
      {evaluating ? (
        <div className="space-y-4 max-md:space-y-3">
          {state.status === 'evaluating' && <Prompt puzzle={puzzle} evaluating />}
          <EvaluationPanel state={state} puzzle={puzzle} dispatch={dispatch} />
        </div>
      ) : (
        <MovePanel {...props} />
      )}
    </div>
  )
}

/** Finding a valid move: the board is played, the engine judges the move. */
function MovePanel({ state, puzzle, dispatch }: PanelProps) {
  const { status, tried, triedCp, best, bestCp } = state
  const last = state.index === state.puzzles.length - 1
  // Already solved or revealed: the player is trying other moves and may move on at any time.
  const exploring = state.outcome !== undefined
  // The position's evaluation stays visible once the first verdict has shown it, or from the start
  // when the player has just evaluated the position (part 1).
  const positionCp =
    state.assessment !== undefined ||
    state.attempts > 1 ||
    (state.attempts === 1 && status !== 'checking')
      ? bestCp
      : undefined
  const next = (
    <Button size="lg" className="w-full" onClick={() => dispatch({ type: 'next' })}>
      {last ? m.training_see_summary() : m.training_next()}
      <ArrowRight data-icon="inline-end" />
    </Button>
  )

  if (status === 'thinking' || status === 'checking') {
    return (
      <div className="space-y-4">
        <Prompt puzzle={puzzle} exploring={exploring} positionCp={positionCp} />
        {status === 'checking' && (
          <p className="flex items-center gap-2 text-lg text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
            {m.training_checking()}
          </p>
        )}
        {exploring && next}
      </div>
    )
  }

  const foundBest = Boolean(tried && best && sameMove(puzzle.fen, tried, best))
  const yourMove = tried && (
    <MoveLine
      color={puzzle.color}
      label={m.training_your_move()}
      san={sanOf(puzzle.fen, tried)}
      cp={triedCp}
      baseCp={bestCp}
      // Found the engine's move: a "(0.0)" change would only add noise.
      showDelta={!foundBest}
    />
  )
  const bestMove = best && (
    <MoveLine
      color={puzzle.color}
      label={m.training_best_move()}
      san={sanOf(puzzle.fen, best)}
      preview={{ fen: puzzle.fen, uci: best }}
      cp={bestCp}
      baseCp={bestCp}
      showDelta={false}
    />
  )

  if (status === 'wrong') {
    return (
      <div className="space-y-4">
        <Feedback tone="bad" icon={<X />} title={m.training_wrong_title()}>
          {yourMove}
          <p className="hidden text-sm text-foreground md:block">
            {tried && sameMove(puzzle.fen, tried, puzzle.played.uci)
              ? m.training_wrong_game_move()
              : m.training_wrong_hint()}
          </p>
          {tried && state.triedReply && (
            <p className="flex items-center gap-2 text-base text-text-strong">
              <span className="text-sm text-muted-foreground">{m.training_engine_reply()}</span>
              <span className="text-xl font-semibold text-loss">
                {sanOf(play(puzzle.fen, tried).fen, state.triedReply)}
              </span>
            </p>
          )}
        </Feedback>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            // While exploring, moving on is the main action.
            variant={exploring ? 'outline' : 'default'}
            onClick={() => dispatch({ type: 'retry' })}
          >
            <RotateCcw data-icon="inline-start" />
            {m.training_retry()}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={!best}
            onClick={() => dispatch({ type: 'reveal' })}
          >
            <Lightbulb data-icon="inline-start" />
            {m.training_show_solution()}
          </Button>
        </div>
        {exploring && next}
        <DeeperLinks puzzle={puzzle} />
      </div>
    )
  }
  if (status !== 'solved' && status !== 'revealed') return null

  return (
    <div className="space-y-4 max-md:space-y-3">
      {status === 'solved' ? (
        <Feedback tone="good" icon={<Check />} title={m.training_solved_title()}>
          {yourMove}
          {foundBest ? (
            <p className="hidden text-sm text-foreground md:block">{m.training_solved_best()}</p>
          ) : (
            bestMove
          )}
          <ValidMoves state={state} puzzle={puzzle} />
        </Feedback>
      ) : (
        <Feedback tone="solution" icon={<Lightbulb />} title={m.training_revealed_title()}>
          {bestMove}
          <ValidMoves state={state} puzzle={puzzle} />
        </Feedback>
      )}
      <div className={cn('space-y-3', APPEAR)}>
        <div className="px-1">
          <MoveLine
            color={puzzle.color}
            label={m.training_game_move()}
            san={puzzle.played.san}
            preview={{ fen: puzzle.fen, uci: puzzle.played.uci }}
            cp={puzzle.afterCp}
            baseCp={bestCp}
          />
        </div>
        <DeeperLinks puzzle={puzzle} />
      </div>
      {/* Side by side on a phone */}
      <div className="grid gap-2 max-md:grid-cols-2">
        {next}
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => dispatch({ type: 'explore' })}
        >
          <Shuffle data-icon="inline-start" />
          {m.training_explore()}
        </Button>
      </div>
    </div>
  )
}
