import type { Config } from '@lichess-org/chessground/config'
import type { Key } from '@lichess-org/chessground/types'
import type { Color } from 'chessops'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Board } from '@/components/board/Board'
import { SideSquare } from '@/features/games/components/GamesTable'
import type { ReviewGame } from '@/features/review/games'
import { gamePhases } from '@/features/review/phases'
import { moveSquares } from '@/features/training/moves'
import { formatClock, formatMoveTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import type { MoveNote } from '../study'
import { barShare, timeBars } from '../timeChart'
import type { StudyNode } from '../tree'

/** As the evaluation chart's, so that a move is at the same place on both */
const PAD_X = 6
const PAD_Y = 8
const LABEL_ROOM = 80
/** The preview over the chart: its board, and the move's details beside it (px) */
const PREVIEW_SIZE = 240
const PREVIEW_DETAILS = 150
const PREVIEW_WIDTH = PREVIEW_DETAILS + 12 + PREVIEW_SIZE + 16 + 2

/**
 * The time each move took, in a mirror: White's moves rise above the middle line, Black's sink
 * below it, in their colors; the player's bars stronger than the opponent's. Their heights on a
 * square-root scale (one long think does not crush the rest). A thin line on each side follows
 * that side's clock, to see time trouble coming. Errors as on the evaluation chart (when analysed):
 * the player's bars red, a ring at the tip of the opponent's. As the evaluation chart on the review
 * page: the move on screen marked, a click (a tap, a sliding finger) goes to the move under the
 * pointer, the mouse previews it above the chart.
 */
export function TimeChart({
  game,
  positions,
  notes,
  selected,
  onSelect,
  orientation,
  height,
}: {
  game: ReviewGame
  /** The game's positions, from the start (index = half-moves played) */
  positions: StudyNode[]
  notes: MoveNote[]
  selected: number
  onSelect: (index: number) => void
  orientation: Color
  height: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState<number>()
  const touching = useRef(false)
  const active = hovered ?? selected

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const bars = useMemo(
    () =>
      game.clock
        ? timeBars(
            game.clock,
            positions.map((position) => position.turn),
            game.source !== 'lichess',
          )
        : [],
    [game.clock, game.source, positions],
  )
  const phases = useMemo(() => gamePhases(positions), [positions])
  const preview = useMemo(
    () => (hovered !== undefined ? boardAt(positions[hovered], orientation) : undefined),
    [hovered, positions, orientation],
  )

  const count = positions.length
  if (!game.clock || count < 2) return null
  const initial = game.clock.initial
  const longest = Math.max(0, ...bars.map((bar) => bar.spent ?? 0))
  const fullClock = Math.max(initial, ...bars.map((bar) => bar.left))
  const x = (index: number) => PAD_X + (index * (width - 2 * PAD_X)) / Math.max(count - 1, 1)
  const mid = height / 2
  const room = mid - PAD_Y
  /** Up for White, down for Black */
  const side = (color: Color) => (color === 'white' ? -1 : 1)
  const barWidth = Math.max(1, Math.min(8, ((width - 2 * PAD_X) / Math.max(count - 1, 1)) * 0.7))
  const clockLine = (color: Color) =>
    [{ index: 0, left: initial }, ...bars.filter((bar) => bar.mover === color)]
      .map(
        (point, at) =>
          `${at === 0 ? 'M' : 'L'}${x(point.index)} ${mid + side(color) * (point.left / fullClock) * room}`,
      )
      .join(' ')

  /** The move nearest to the pointer, along the game: never the starting position. */
  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left - PAD_X) / Math.max(box.width - 2 * PAD_X, 1)
    return Math.min(Math.max(Math.round(ratio * (count - 1)), 1), count - 1)
  }
  const mine = notes.some((note) => note.mine)
  const theirs = notes.some((note) => note.theirs)

  return (
    <div className="space-y-2">
      <div ref={wrapRef} className="relative">
        <svg
          width="100%"
          height={height}
          role="img"
          aria-label={m.time_chart_label()}
          className="block cursor-crosshair touch-pan-y rounded-md border border-border bg-field select-none"
          onPointerMove={(event) => {
            if (event.pointerType === 'mouse') setHovered(nearest(event))
            else if (touching.current) onSelect(nearest(event))
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            touching.current = true
            onSelect(nearest(event))
          }}
          onPointerUp={() => (touching.current = false)}
          onPointerCancel={() => (touching.current = false)}
          onPointerLeave={(event) => event.pointerType === 'mouse' && setHovered(undefined)}
          onClick={(event) => {
            if ((event.nativeEvent as globalThis.PointerEvent).pointerType !== 'mouse') return
            onSelect(nearest(event as unknown as PointerEvent<SVGSVGElement>))
          }}
        >
          {width > 0 && (
            <>
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
              {bars.map((bar) => {
                if (bar.spent === undefined) return null
                const length = Math.max(1, barShare(bar.spent, longest) * room)
                const note = notes[bar.index]
                return (
                  <rect
                    key={bar.index}
                    x={x(bar.index) - barWidth / 2}
                    y={bar.mover === 'white' ? mid - length : mid}
                    width={barWidth}
                    height={length}
                    rx={Math.min(1.5, barWidth / 2)}
                    className={cn(
                      note?.mine
                        ? 'fill-loss'
                        : bar.mover === 'white'
                          ? 'fill-piece-white'
                          : 'fill-piece-black stroke-border-strong',
                      // The opponent's bars fainter than the player's
                      bar.mover !== game.color && 'opacity-45',
                    )}
                  />
                )
              })}
              <line x1={0} x2={width} y1={mid} y2={mid} className="stroke-border-strong" />
              {(['white', 'black'] as const).map((color) => (
                <path
                  key={color}
                  d={clockLine(color)}
                  fill="none"
                  strokeWidth={1.25}
                  strokeLinejoin="round"
                  className="stroke-primary"
                />
              ))}
              {bars.map((bar) => {
                if (!notes[bar.index]?.theirs || bar.spent === undefined) return null
                const length = Math.max(1, barShare(bar.spent, longest) * room)
                return (
                  <circle
                    key={`o${bar.index}`}
                    cx={x(bar.index)}
                    cy={mid + side(bar.mover) * length}
                    r={3.5}
                    strokeWidth={1.5}
                    className="fill-field stroke-muted-foreground"
                  />
                )
              })}
              <line
                x1={x(active)}
                x2={x(active)}
                y1={0}
                y2={height}
                className="stroke-text-strong/40"
              />
              <circle
                cx={x(active)}
                cy={mid}
                r={4}
                strokeWidth={2}
                className="fill-primary stroke-field"
              />
            </>
          )}
        </svg>
        {preview && hovered !== undefined && width > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-20 flex items-start gap-3 rounded-md border border-border-strong bg-popover p-2 shadow-lg"
            style={{
              width: PREVIEW_WIDTH,
              bottom: height + 6,
              left: Math.max(0, Math.min(x(hovered) - PREVIEW_WIDTH / 2, width - PREVIEW_WIDTH)),
            }}
          >
            <MoveTime
              before={positions[hovered - 1]}
              after={positions[hovered]}
              bar={bars.find((bar) => bar.index === hovered)}
              note={notes[hovered]}
            />
            <div className="shrink-0" style={{ width: PREVIEW_SIZE }}>
              <Board config={preview} className="rounded-sm" />
            </div>
          </div>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-1.5 rounded-xs bg-piece-white" />
          <span className="h-2.5 w-1.5 rounded-xs border border-border-strong bg-piece-black" />
          {m.time_chart_legend_spent()}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-primary" />
          {m.time_chart_legend_left()}
        </span>
        {mine && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-1.5 rounded-xs bg-loss" />
            {m.eval_chart_legend_mine()}
          </span>
        )}
        {theirs && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-[1.5px] border-muted-foreground" />
            {m.eval_chart_legend_theirs()}
          </span>
        )}
      </p>
    </div>
  )
}

function boardAt(position: StudyNode | undefined, orientation: Color): Config | undefined {
  if (!position) return undefined
  return {
    fen: position.fen,
    orientation,
    viewOnly: true,
    coordinates: false,
    lastMove: position.move ? (moveSquares(position.move.uci) as [Key, Key]) : undefined,
  }
}

/** The preview's details: the move, the time it took and the clock left, an error. */
function MoveTime({
  before,
  after,
  bar,
  note,
}: {
  before: StudyNode | undefined
  after: StudyNode | undefined
  bar: ReturnType<typeof timeBars>[number] | undefined
  note: MoveNote | undefined
}) {
  if (!before || !after) return null
  const number = Number(before.fen.split(' ')[5] ?? 1)
  return (
    <div className="shrink-0 space-y-2" style={{ width: PREVIEW_DETAILS }}>
      <p className="flex items-center gap-2 text-base font-medium text-text-strong">
        <SideSquare color={before.turn} />
        {`${number}${before.turn === 'white' ? '.' : '…'} ${after.move?.san ?? ''}`}
      </p>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
        <dt className="text-xs text-muted-foreground">{m.eval_chart_time_spent()}</dt>
        <dd className="num text-text-strong">
          {bar?.spent !== undefined ? formatMoveTime(bar.spent) : '—'}
        </dd>
        <dt className="text-xs text-muted-foreground">{m.eval_chart_clock()}</dt>
        <dd className="num text-text-strong">{bar ? formatClock(bar.left) : '—'}</dd>
      </dl>
      {(note?.mine || note?.theirs) && (
        <p className={cn('text-xs font-medium', note.mine ? 'text-loss' : 'text-muted-foreground')}>
          {note.mine ? m.eval_chart_your_mistake() : m.eval_chart_their_mistake()}
        </p>
      )}
    </div>
  )
}
