import type { Config } from '@lichess-org/chessground/config'
import type { Key } from '@lichess-org/chessground/types'
import type { Color } from 'chessops'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { Board } from '@/components/board/Board'
import { SideSquare } from '@/features/games/components/GamesTable'
import { RESULTS } from '@/features/games/results'
import { ReviewLink } from '@/features/study/components/ReviewLink'
import { evalDelta, formatDelta, formatEval } from '@/features/training/evaluation'
import { moveSquares } from '@/features/training/moves'
import { formatClock, formatMoveTime, formatNumber, formatSigned } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import type { ReviewedGame } from '../analyze'
import { forColor, winChance } from '../errors'
import { moveTime } from '../games'
import { gamePhases } from '../phases'

const HEIGHT = 180
/** Room left and right of the curve, for the first and last points */
const PAD_X = 6
/** Room above and below, for the points at the extremes */
const PAD_Y = 8
/** Width a phase label needs before the next one */
const LABEL_ROOM = 80

/** What the chart says about the move leading to position `index` (index ≥ 1). */
function moveInfo(game: ReviewedGame, index: number) {
  const before = game.positions[index - 1]!
  const position = game.positions[index]!
  const number = Math.floor((index - 1) / 2) + 1
  const mover: Color = before.turn
  // Lichess's clocks start after each side's first move.
  const time = game.clock && moveTime(game.clock, index - 1, game.source !== 'lichess')
  const delta = evalDelta(forColor(before.cp, mover), forColor(position.cp, mover))
  return {
    label: `${number}${mover === 'white' ? '.' : '…'} ${position.move?.san ?? ''}`,
    position,
    mover,
    delta,
    time,
    mine: game.mistakes.some((mistake) => mistake.ply === index - 1),
    theirs: game.opponentErrors.includes(index - 1),
  }
}

/**
 * The game's evaluation, move by move, as on Lichess: White's advantage rises in light, Black's
 * sinks in dark, on a winning-chances scale (a +8 does not crush the rest). The player's errors are
 * red points, the opponent's hollow rings; phases are thin vertical lines. Hovering anywhere shows
 * the nearest move (its evaluation, the change for whoever played it, the board after it);
 * clicking freezes it, with a button to the game's review page. On a phone, a tap freezes the nearest move and the
 * details show under the chart; a finger can slide along it.
 */
export function EvalChart({
  game,
  ratingChange,
  legendAside,
  selected,
  onSelect,
  height = HEIGHT,
}: {
  game: ReviewedGame
  /** For the summary of the game, when known */
  ratingChange?: number
  /** On the legend's line, on its right */
  legendAside?: ReactNode
  /**
   * The review page's chart: no details beside it, the position on screen (`selected`) marked,
   * and a click (a tap, a sliding finger) goes to the move under the pointer.
   */
  selected?: number
  onSelect?: (index: number) => void
  height?: number
}) {
  const ids = useId().replaceAll(':', '')
  const wrapRef = useRef<HTMLDivElement>(null)
  /** The chart with its details: a tap there keeps the frozen move */
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const [pinned, setPinned] = useState<number | undefined>(undefined)
  const touching = useRef(false)
  const active = onSelect ? (hovered ?? selected) : (pinned ?? hovered)

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A click or tap outside the chart and its details lets go of the frozen move.
  useEffect(() => {
    if (pinned === undefined) return
    const onDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(undefined)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

  const count = game.positions.length
  const phases = useMemo(() => gamePhases(game.positions), [game.positions])
  const x = (index: number) => PAD_X + (index * (width - 2 * PAD_X)) / Math.max(count - 1, 1)
  const mid = height / 2
  const y = (cp: number) => mid - ((winChance(cp) - 50) / 50) * (mid - PAD_Y)
  const curve = game.positions
    .map((position, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(position.cp)}`)
    .join(' ')
  const area = `${curve} L${x(count - 1)} ${mid} L${x(0)} ${mid} Z`

  /** The move nearest to the pointer, along the game: never the starting position. */
  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left - PAD_X) / Math.max(box.width - 2 * PAD_X, 1)
    return Math.min(Math.max(Math.round(ratio * (count - 1)), 1), count - 1)
  }
  if (count < 2) return null

  const points = (plies: number[]) => plies.map((ply) => ply + 1).filter((index) => index < count)
  return (
    <div ref={rootRef} className="space-y-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div ref={wrapRef} className="relative min-w-0 md:flex-1">
          <svg
            width="100%"
            height={height}
            role="img"
            aria-label={m.eval_chart_label()}
            className="block cursor-crosshair touch-pan-y rounded-md border border-border bg-field select-none"
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse') setHovered(nearest(event))
              else if (touching.current) (onSelect ?? setPinned)(nearest(event))
            }}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') return
              touching.current = true
              ;(onSelect ?? setPinned)(nearest(event))
            }}
            onPointerUp={() => (touching.current = false)}
            onPointerCancel={() => (touching.current = false)}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(undefined)}
            onClick={(event) => {
              if ((event.nativeEvent as globalThis.PointerEvent).pointerType !== 'mouse') return
              const index = nearest(event as unknown as PointerEvent<SVGSVGElement>)
              if (onSelect) onSelect(index)
              else setPinned((current) => (current === index ? undefined : index))
            }}
          >
            {width > 0 && (
              <>
                <defs>
                  <clipPath id={`${ids}-top`}>
                    <rect x={0} y={0} width={width} height={mid} />
                  </clipPath>
                  <clipPath id={`${ids}-bottom`}>
                    <rect x={0} y={mid} width={width} height={mid} />
                  </clipPath>
                </defs>
                <path d={area} className="fill-text-strong/80" clipPath={`url(#${ids}-top)`} />
                <path d={area} className="fill-background" clipPath={`url(#${ids}-bottom)`} />
                <line x1={0} x2={width} y1={mid} y2={mid} className="stroke-border-strong" />
                {(
                  [
                    ['middlegame', phases.middlegame, m.phase_middlegame()],
                    ['endgame', phases.endgame, m.phase_endgame()],
                  ] as const
                ).map(
                  ([phase, index, label]) =>
                    index !== undefined && (
                      <g key={phase}>
                        <line
                          x1={x(index)}
                          x2={x(index)}
                          y1={0}
                          y2={height}
                          className="stroke-border-strong/60"
                        />
                        <text
                          x={x(index) + 4}
                          // Phases close together: the endgame's label goes to the bottom.
                          y={
                            phase === 'endgame' &&
                            phases.middlegame !== undefined &&
                            x(index) - x(phases.middlegame) < LABEL_ROOM
                              ? height - 6
                              : 12
                          }
                          className="fill-muted-foreground text-[10px]"
                        >
                          {label}
                        </text>
                      </g>
                    ),
                )}
                <path
                  d={curve}
                  fill="none"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  className="stroke-primary"
                />
                {active !== undefined && (
                  <line
                    x1={x(active)}
                    x2={x(active)}
                    y1={0}
                    y2={height}
                    className="stroke-text-strong/40"
                  />
                )}
                {points(game.opponentErrors).map((index) => (
                  <circle
                    key={`o${index}`}
                    cx={x(index)}
                    cy={y(game.positions[index]!.cp)}
                    r={3.5}
                    strokeWidth={1.5}
                    className="fill-field stroke-muted-foreground"
                  />
                ))}
                {points(game.mistakes.map((mistake) => mistake.ply)).map((index) => (
                  <circle
                    key={`m${index}`}
                    cx={x(index)}
                    cy={y(game.positions[index]!.cp)}
                    r={4.5}
                    strokeWidth={2}
                    className="fill-loss stroke-field"
                  />
                ))}
                {active !== undefined && (
                  <circle
                    cx={x(active)}
                    cy={y(game.positions[active]!.cp)}
                    r={4}
                    strokeWidth={2}
                    className="fill-primary stroke-field"
                  />
                )}
              </>
            )}
          </svg>
        </div>
        {/* Beside the chart, always in the same place: the move under the pointer, the game as
            a whole otherwise. On a phone, above the chart once a move is tapped: the finger hides
            what is below it. */}
        {!onSelect && (
          <div className={cn('order-first md:order-last', pinned === undefined && 'max-md:hidden')}>
            {active === undefined ? (
              <GameDetails game={game} ratingChange={ratingChange} />
            ) : (
              <MoveDetails game={game} index={active} />
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend />
        {legendAside}
      </div>
    </div>
  )
}

/**
 * The details beside the chart, the same frame for a move and for the whole game, so that nothing
 * moves from one to the other: a title, a line under it, figures one per line, a note (kept even
 * when empty), the review page's button at the bottom, and the board as tall as the chart.
 */
function DetailsFrame({
  title,
  subtitle,
  rows,
  note,
  action,
  board,
}: {
  title: ReactNode
  subtitle?: ReactNode
  rows: { label: string; value: ReactNode }[]
  note?: ReactNode
  /** At the bottom of the figures */
  action: ReactNode
  board: Config
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex w-52 shrink-0 flex-col gap-2 md:h-[180px]">
        <div className="space-y-0.5">
          <p className="flex items-center gap-2 text-base font-medium text-text-strong">{title}</p>
          {subtitle}
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="num">{row.value}</dd>
            </div>
          ))}
        </dl>
        {/* Kept even when empty (null), so that the figures stay put from a move to the next */}
        {note !== undefined && <p className="min-h-4 text-xs font-medium">{note}</p>}
        <div className="mt-auto">{action}</div>
      </div>
      <div className="w-32 shrink-0 md:w-[180px]">
        <Board config={board} className="rounded-sm" />
      </div>
    </div>
  )
}

function boardAt(game: ReviewedGame, index: number): Config {
  const position = game.positions[index]!
  return {
    fen: position.fen,
    orientation: game.color,
    viewOnly: true,
    coordinates: false,
    lastMove: position.move ? (moveSquares(position.move.uci) as [Key, Key]) : undefined,
  }
}

/** The move, who played it, its evaluation and change, time spent and clock left; an error. */
function MoveDetails({ game, index }: { game: ReviewedGame; index: number }) {
  const { label, position, mover, delta, time, mine, theirs } = moveInfo(game, index)
  const board = useMemo(() => boardAt(game, index), [game, index])
  const rows = [
    {
      label: m.eval_chart_eval(),
      value: (
        <>
          <span className="text-text-strong">{formatEval(position.cp)}</span>
          {delta !== undefined && (
            <span className={cn('ml-1.5', delta < 0 ? 'text-loss' : 'text-muted-foreground')}>
              ({formatDelta(delta)})
            </span>
          )}
        </>
      ),
    },
    // Every move of a timed game has both lines, so that they do not come and go.
    ...(game.clock
      ? [
          {
            label: m.eval_chart_time_spent(),
            value: (
              <span className="text-text-strong">
                {time?.spent !== undefined ? formatMoveTime(time.spent) : '—'}
              </span>
            ),
          },
          {
            label: m.eval_chart_clock(),
            value: <span className="text-text-strong">{time ? formatClock(time.left) : '—'}</span>,
          },
        ]
      : []),
  ]
  return (
    <DetailsFrame
      title={
        <>
          <SideSquare color={mover} />
          {label}
        </>
      }
      rows={rows}
      note={
        mine || theirs ? (
          <span className={mine ? 'text-loss' : 'text-muted-foreground'}>
            {mine ? m.eval_chart_your_mistake() : m.eval_chart_their_mistake()}
          </span>
        ) : null
      }
      action={<ReviewLink game={game} ply={index} />}
      board={board}
    />
  )
}

/**
 * The game as a whole, without a board: its result and opening, then four figures two by two
 * (rating and its change, the player's errors; moves, the opponent's errors), and the review
 * page's button at the bottom. As wide and tall as a move's details with their board, so that the chart
 * keeps its size.
 */
function GameDetails({ game, ratingChange }: { game: ReviewedGame; ratingChange?: number }) {
  const last = game.positions.length - 1
  const result = RESULTS[game.result]
  const figures: { label: string; value: ReactNode }[] = [
    ...(game.rating !== undefined
      ? [
          {
            label: m.eval_chart_rating(),
            value: (
              <>
                <span className="text-text-strong">{formatNumber(game.rating)}</span>
                {ratingChange !== undefined && ratingChange !== 0 && (
                  <span
                    className={cn('ml-1.5 text-sm', ratingChange > 0 ? 'text-win' : 'text-loss')}
                  >
                    {formatSigned(ratingChange)}
                  </span>
                )}
              </>
            ),
          },
        ]
      : []),
    {
      label: m.eval_chart_legend_mine(),
      value: (
        <span className={game.mistakes.length > 0 ? 'text-loss' : 'text-win'}>
          {formatNumber(game.mistakes.length)}
        </span>
      ),
    },
    {
      label: m.eval_chart_moves(),
      value: <span className="text-text-strong">{formatNumber(Math.ceil(last / 2))}</span>,
    },
    {
      label: m.eval_chart_legend_theirs(),
      value: <span className="text-text-strong">{formatNumber(game.opponentErrors.length)}</span>,
    },
  ]
  return (
    // 13rem of figures, 1rem of gap and a 180 px board, as MoveDetails
    <div className="flex flex-col gap-3 md:h-[180px] md:w-[calc(14rem+180px)]">
      <div className="space-y-1">
        <p className={cn('text-lg font-semibold', result.className)}>{result.label()}</p>
        {game.opening && (
          <p className="line-clamp-2 text-sm text-text-strong" title={game.opening.name}>
            {game.opening.name}
            {game.opening.eco && (
              <span className="num ml-2 text-xs text-muted-foreground">{game.opening.eco}</span>
            )}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0 space-y-0.5">
            <dt className="truncate text-xs text-muted-foreground">{figure.label}</dt>
            <dd className="num text-base font-medium">{figure.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto">
        <ReviewLink game={game} />
      </div>
    </div>
  )
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-loss" />
        {m.eval_chart_legend_mine()}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-[1.5px] border-muted-foreground" />
        {m.eval_chart_legend_theirs()}
      </span>
    </p>
  )
}
