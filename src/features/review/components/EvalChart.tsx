import type { Config } from '@lichess-org/chessground/config'
import type { Key } from '@lichess-org/chessground/types'
import type { Color } from 'chessops'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import { Board } from '@/components/board/Board'
import { ExternalLink } from '@/features/player/components/ExternalLink'
import { evalDelta, formatDelta, formatEval } from '@/features/training/evaluation'
import { lichessGameUrl, moveSquares } from '@/features/training/moves'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import type { ReviewedGame } from '../analyze'
import { forColor, winChance } from '../errors'
import { gamePhases } from '../phases'

const HEIGHT = 180
/** Room left and right of the curve, for the first and last points */
const PAD_X = 6
/** Room above and below, for the points at the extremes */
const PAD_Y = 8
/** Distance between the move and its tooltip, and the tooltip's width until measured */
const TIP_GAP = 12
const TIP_WIDTH = 300
/** Width a phase label needs before the next one */
const LABEL_ROOM = 80

/** What the chart says about the move leading to position `index` (index ≥ 1). */
function moveInfo(game: ReviewedGame, index: number) {
  const before = game.positions[index - 1]!
  const position = game.positions[index]!
  const number = Math.floor((index - 1) / 2) + 1
  const mover: Color = before.turn
  const delta = evalDelta(forColor(before.cp, mover), forColor(position.cp, mover))
  return {
    label: `${number}${mover === 'white' ? '.' : '…'} ${position.move?.san ?? ''}`,
    position,
    mover,
    delta,
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
  // The tooltip's width, to know whether it fits left of the move.
  const tipRef = useRef<HTMLDivElement>(null)
  const [tipWidth, setTipWidth] = useState(TIP_WIDTH)
  const active = pinned ?? hovered
  useLayoutEffect(() => {
    if (tipRef.current?.offsetWidth) setTipWidth(tipRef.current.offsetWidth)
  }, [active])

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
      {/* Phone: above the chart, once a move is tapped (the finger hides what is below it). */}
      {pinned !== undefined && (
        <div className="md:hidden">
          <MoveDetails game={game} index={pinned} pinned inline />
        </div>
      )}
      <div ref={wrapRef} className="relative">
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
        {/* Computer: floating left of the move, over the moves already played, so the rest of
            the game stays in sight; on its right only when there is no room. */}
        {active !== undefined && width > 0 && (
          <div
            ref={tipRef}
            className="pointer-events-none absolute top-2 z-10 hidden md:block"
            style={
              x(active) - TIP_GAP - tipWidth >= 0
                ? { right: width - x(active) + TIP_GAP }
                : { left: x(active) + TIP_GAP }
            }
          >
            <MoveDetails game={game} index={active} pinned={pinned !== undefined} />
          </div>
        )}
      </div>
      <Legend />
    </div>
  )
}

/** The move, its evaluation and change, the board after it; once frozen, a link to Lichess. */
function MoveDetails({
  game,
  index,
  pinned,
  inline = false,
}: {
  game: ReviewedGame
  index: number
  pinned: boolean
  inline?: boolean
}) {
  const { label, position, delta, mine, theirs } = moveInfo(game, index)
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
    // Side by side, so it fits within the chart's height.
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border border-border bg-popover p-2',
        inline ? 'w-full' : 'w-max shadow-pop',
        pinned && 'pointer-events-auto',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1 whitespace-nowrap">
        <p className="text-sm font-medium text-text-strong">{label}</p>
        <p className="num flex items-baseline gap-2 text-sm">
          <span className="text-text-strong">{formatEval(position.cp)}</span>
          {delta !== undefined && (
            <span className={delta < 0 ? 'text-loss' : 'text-muted-foreground'}>
              ({formatDelta(delta)})
            </span>
          )}
        </p>
        {(mine || theirs) && (
          <p className={cn('text-xs', mine ? 'text-loss' : 'text-muted-foreground')}>
            {mine ? m.eval_chart_your_mistake() : m.eval_chart_their_mistake()}
          </p>
        )}
        {pinned && (
          <p className="pt-1 text-xs">
            <ExternalLink href={lichessGameUrl(game, index, game.color, position.fen)}>
              {m.training_analyse_lichess()}
            </ExternalLink>
          </p>
        )}
      </div>
      <div className={cn('shrink-0', inline ? 'w-32' : 'w-36')}>
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
