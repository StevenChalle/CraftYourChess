import type { Config } from '@lichess-org/chessground/config'
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Key } from '@lichess-org/chessground/types'
import type { Color } from 'chessops'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '@/components/board/Board'
import { toCp, winChance, type WhiteScore } from '@/features/review/errors'
import { boardMoveToUci, isCheck, legalDests, moveSquares } from '@/features/training/moves'
import { cn } from '@/lib/utils'
import type { StudyNode } from '../tree'

/** Wheel distance for one move: a mouse notch (100 in Chrome), or many small trackpad steps */
const WHEEL_STEP = 100

/**
 * The position on screen, as large as the training's board, with the evaluation bar beside it.
 * Any legal move can be played on it, by either side; the mouse wheel over it goes through the
 * moves. `arrow`: the engine's best move.
 */
export function StudyBoard({
  node,
  orientation,
  score,
  arrow,
  onMove,
  onWheelStep,
}: {
  node: StudyNode
  orientation: Color
  score: WhiteScore | undefined
  arrow?: string
  onMove: (uci: string) => void
  onWheelStep: (direction: 'back' | 'forward') => void
}) {
  // Every move played sets the board again from the position: one the page did not take (refused,
  // or played on a board out of step) never stays on screen.
  const [moves, setMoves] = useState(0)
  const config = useMemo((): Config => {
    const shapes: DrawShape[] = []
    if (arrow) {
      const [orig, dest] = moveSquares(arrow) as [Key, Key]
      shapes.push({ orig, dest, brush: 'paleBlue' })
    }
    return {
      fen: node.fen,
      orientation,
      turnColor: node.turn,
      check: isCheck(node.fen) ? node.turn : false,
      lastMove: node.move ? (moveSquares(node.move.uci) as [Key, Key]) : undefined,
      movable: {
        free: false,
        color: node.over ? undefined : node.turn,
        dests: node.over ? new Map() : legalDests(node.fen),
        showDests: true,
        events: {
          after: (orig, dest) => {
            setMoves((count) => count + 1)
            onMove(boardMoveToUci(node.fen, orig, dest))
          },
        },
      },
      premovable: { enabled: false },
      drawable: { enabled: true, autoShapes: shapes },
    }
    // `moves`: a new config, the same position, after each move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, orientation, arrow, onMove, moves])

  // The wheel goes through the moves, not the page (a listener that may prevent scrolling).
  const wheelRef = useRef<HTMLDivElement>(null)
  const stepRef = useRef(onWheelStep)
  useEffect(() => {
    stepRef.current = onWheelStep
  })
  useEffect(() => {
    const element = wheelRef.current
    if (!element) return
    let pending = 0
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      pending += event.deltaY
      while (Math.abs(pending) >= WHEEL_STEP) {
        stepRef.current(pending > 0 ? 'forward' : 'back')
        pending -= Math.sign(pending) * WHEEL_STEP
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div ref={wheelRef} className="flex gap-2">
      <EvalBar score={score} orientation={orientation} />
      <div className="min-w-0 flex-1">
        <Board config={config} className="rounded-sm" />
      </div>
    </div>
  )
}

/** White's share of the bar: their winning chances, as on Lichess. Thin, the board's height. */
function EvalBar({ score, orientation }: { score: WhiteScore | undefined; orientation: Color }) {
  const white = score === undefined ? 50 : winChance(toCp(score))
  return (
    <div
      aria-hidden
      className={cn(
        'relative w-2.5 shrink-0 overflow-hidden rounded-sm border border-border bg-piece-black',
        'max-md:hidden',
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 bg-piece-white transition-[height] duration-300 ease-out',
          orientation === 'white' ? 'bottom-0' : 'top-0',
        )}
        style={{ height: `${white}%` }}
      />
      <div className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
    </div>
  )
}
