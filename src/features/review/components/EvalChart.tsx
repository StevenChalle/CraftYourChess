import type { Config } from '@lichess-org/chessground/config'
import type { Key } from '@lichess-org/chessground/types'
import type { Color } from 'chessops'
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Board } from '@/components/board/Board'
import { SideSquare } from '@/features/games/components/GamesTable'
import { ExternalLink } from '@/features/player/components/ExternalLink'
import { evalDelta, formatDelta, formatEval } from '@/features/training/evaluation'
import { lichessGameUrl, moveSquares } from '@/features/training/moves'
import { formatClock, formatMoveTime } from '@/lib/format'
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
 * clicking freezes it, with a link to Lichess. On a phone, a tap freezes the nearest move and the
 * details show under the chart; a finger can slide along it.
 */
export function EvalChart({ game }: { game: ReviewedGame }) {
  const ids = useId().replaceAll(':', '')
  const wrapRef = useRef<HTMLDivElement>(null)
  /** The chart with its details: a tap there keeps the frozen move */
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  const [pinned, setPinned] = useState<number | undefined>(undefined)
  const touching = useRef(false)
  const active = pinned ?? hovered

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
  const mid = HEIGHT / 2
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
            height={HEIGHT}
            role="img"
            aria-label={m.eval_chart_label()}
            className="block cursor-crosshair touch-pan-y rounded-md border border-border bg-field select-none"
            onPointerMove={(event) => {
              if (event.pointerType === 'mouse') setHovered(nearest(event))
              else if (touching.current) setPinned(nearest(event))
            }}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') return
              touching.current = true
              setPinned(nearest(event))
            }}
            onPointerUp={() => (touching.current = false)}
            onPointerCancel={() => (touching.current = false)}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(undefined)}
            onClick={(event) => {
              if ((event.nativeEvent as globalThis.PointerEvent).pointerType !== 'mouse') return
              const index = nearest(event as unknown as PointerEvent<SVGSVGElement>)
              setPinned((current) => (current === index ? undefined : index))
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
                          y2={HEIGHT}
                          className="stroke-border-strong/60"
                        />
                        <text
                          x={x(index) + 4}
                          // Phases close together: the endgame's label goes to the bottom.
                          y={
                            phase === 'endgame' &&
                            phases.middlegame !== undefined &&
                            x(index) - x(phases.middlegame) < LABEL_ROOM
                              ? HEIGHT - 6
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
                    y2={HEIGHT}
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
        {/* Beside the chart, always in the same place: the move under the pointer (the last
            one until then). On a phone, above the chart once a move is tapped: the finger hides
            what is below it. */}
        <div className={cn('order-first md:order-last', pinned === undefined && 'max-md:hidden')}>
          <MoveDetails game={game} index={active ?? count - 1} />
        </div>
      </div>
      <Legend />
    </div>
  )
}

/**
 * The move, who played it, then each figure on its line (evaluation and its change, time spent,
 * clock left), the board after it as tall as the chart, and a link to Lichess.
 */
function MoveDetails({ game, index }: { game: ReviewedGame; index: number }) {
  const { label, position, mover, delta, time, mine, theirs } = moveInfo(game, index)
  const config = useMemo(
    (): Config => ({
      fen: position.fen,
      orientation: game.color,
      viewOnly: true,
      coordinates: false,
      lastMove: position.move ? (moveSquares(position.move.uci) as [Key, Key]) : undefined,
    }),
    [position, game.color],
  )
  return (
    <div className="flex items-start gap-4">
      <div className="w-44 shrink-0 space-y-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-base font-medium text-text-strong">
            <SideSquare color={mover} />
            {label}
          </p>
          {(mine || theirs) && (
            <p className={cn('text-xs font-medium', mine ? 'text-loss' : 'text-muted-foreground')}>
              {mine ? m.eval_chart_your_mistake() : m.eval_chart_their_mistake()}
            </p>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
          <dt className="text-xs text-muted-foreground">{m.eval_chart_eval()}</dt>
          <dd className="num">
            <span className="text-text-strong">{formatEval(position.cp)}</span>
            {delta !== undefined && (
              <span className={cn('ml-1.5', delta < 0 ? 'text-loss' : 'text-muted-foreground')}>
                ({formatDelta(delta)})
              </span>
            )}
          </dd>
          {time?.spent !== undefined && (
            <>
              <dt className="text-xs text-muted-foreground">{m.eval_chart_time_spent()}</dt>
              <dd className="num text-text-strong">{formatMoveTime(time.spent)}</dd>
            </>
          )}
          {time && (
            <>
              <dt className="text-xs text-muted-foreground">{m.eval_chart_clock()}</dt>
              <dd className="num text-text-strong">{formatClock(time.left)}</dd>
            </>
          )}
        </dl>
        <p className="text-xs">
          <ExternalLink href={lichessGameUrl(game, index, game.color, position.fen)}>
            {m.training_analyse_lichess()}
          </ExternalLink>
        </p>
      </div>
      <div className="w-32 shrink-0 md:w-[180px]">
        <Board config={config} className="rounded-sm" />
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
