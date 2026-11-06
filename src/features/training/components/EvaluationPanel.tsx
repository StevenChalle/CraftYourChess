import type { Color } from 'chessops'
import { ArrowRight, Check, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Mistake } from '@/features/review/analyze'
import { forColor } from '@/features/review/errors'
import { formatSignedTenths } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { assess, EQUAL_MAX_CP, WINNING_MIN_CP, type Assessment } from '../assessment'
import { cpChip } from '@/components/evalChip'
import { formatEvalPrecise } from '../evaluation'
import { assessmentVerdict, type TrainingAction, type TrainingState } from '../session'

const ASSESSMENT_LABELS: Record<Assessment, () => string> = {
  'white-winning': m.assess_white_winning,
  'black-winning': m.assess_black_winning,
  'white-better': m.assess_white_better,
  'black-better': m.assess_black_better,
  equal: m.assess_equal,
}

const pawns = (cp: number) => formatSignedTenths(cp / 100)

/** The evaluations each word covers, as in the buttons: "≥ +2.0", "+0.3 to +2.0"… */
function assessmentRange(assessment: Assessment): string {
  const sign = assessment.startsWith('white') ? 1 : -1
  if (assessment === 'equal') {
    return m.assess_range_between({ from: pawns(-EQUAL_MAX_CP), to: pawns(EQUAL_MAX_CP) })
  }
  if (assessment.endsWith('winning')) {
    const bound = pawns(sign * WINNING_MIN_CP)
    return sign > 0 ? m.assess_range_min({ value: bound }) : m.assess_range_max({ value: bound })
  }
  return m.assess_range_between({
    from: pawns(sign * EQUAL_MAX_CP),
    to: pawns(sign * WINNING_MIN_CP),
  })
}

/** The player's side in the left column: winning, better, then equal across. */
function buttonOrder(color: Color): Assessment[] {
  const mine = color
  const theirs = color === 'white' ? 'black' : 'white'
  return [`${mine}-winning`, `${theirs}-winning`, `${mine}-better`, `${theirs}-better`, 'equal']
}

/**
 * The "evaluate the position" exercise: five words to choose from (the board cannot be played),
 * then the verdict with the engine's evaluation, to two decimals.
 */
export function EvaluationPanel({
  state,
  puzzle,
  dispatch,
}: {
  state: TrainingState
  puzzle: Mistake
  dispatch: (action: TrainingAction) => void
}) {
  if (state.status === 'evaluating') {
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {buttonOrder(puzzle.color).map((assessment) => (
          // Tiles like the statistics': the word, then the evaluations it covers.
          <button
            key={assessment}
            type="button"
            onClick={() => dispatch({ type: 'assess', answer: assessment })}
            className={cn(
              'flex flex-col items-start gap-0.5 rounded-sm border border-border bg-field px-3 py-1.5 text-left transition-colors hover:border-border-strong hover:bg-raised active:translate-y-px',
              assessment === 'equal' && 'col-span-2',
            )}
          >
            <span className="text-[13px] font-medium text-text-strong">
              {ASSESSMENT_LABELS[assessment]()}
            </span>
            <span className="num text-xs text-muted-foreground">{assessmentRange(assessment)}</span>
          </button>
        ))}
      </div>
    )
  }

  const verdict = assessmentVerdict(state)
  const answer = state.assessment!
  const last = state.index === state.puzzles.length - 1
  if (verdict === undefined || state.bestCp === undefined) {
    // The engine is still evaluating the position.
    return (
      <p className="flex items-center gap-2 text-lg text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
        {m.training_checking()}
      </p>
    )
  }
  const whiteCp = forColor(state.bestCp, puzzle.color)
  const exact = assess(whiteCp)
  return (
    <div className="space-y-4 max-md:space-y-3">
      <div
        className={cn(
          'space-y-2 rounded-md p-4 ring-1 max-md:p-3',
          verdict ? 'bg-win/12 ring-win/40' : 'bg-loss/10 ring-loss/35',
          'animate-in duration-200 ease-out fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none',
        )}
      >
        <p
          className={cn(
            'flex items-center gap-3 text-xl font-semibold max-md:gap-2 max-md:text-lg',
            verdict ? 'text-win' : 'text-loss',
          )}
        >
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-primary-foreground max-md:size-7 [&_svg]:size-5',
              verdict ? 'bg-win' : 'bg-loss',
            )}
          >
            {verdict ? <Check /> : <X />}
          </span>
          {verdict ? m.training_assess_right() : m.training_wrong_title()}
        </p>
        <Line label={m.training_assess_yours()} value={ASSESSMENT_LABELS[answer]()} />
        <Line
          label={m.training_assess_engine()}
          value={ASSESSMENT_LABELS[exact]()}
          eval={whiteCp}
        />
        {verdict && answer !== exact && (
          <p className="text-sm text-muted-foreground">{m.training_assess_limit()}</p>
        )}
      </div>
      <Button size="lg" className="w-full" onClick={() => dispatch({ type: 'next' })}>
        {state.replay
          ? m.training_assess_continue()
          : last
            ? m.training_see_summary()
            : m.training_next()}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  )
}

/** "Engine   White is better   +0.32", on one line. */
function Line({
  label,
  value,
  eval: evaluation,
}: {
  label: string
  value: string
  /** White's side, centipawns */
  eval?: number
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold text-text-strong">{value}</span>
      {evaluation !== undefined && (
        <span
          className={cn(
            'num ml-auto rounded-sm border px-1.5 py-0.5 text-sm font-medium',
            cpChip(evaluation),
          )}
        >
          {formatEvalPrecise(evaluation)}
        </span>
      )}
    </p>
  )
}
