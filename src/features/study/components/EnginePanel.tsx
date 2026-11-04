import type { Key } from '@lichess-org/chessground/types'
import type { Color } from 'chessops'
import { Cpu } from 'lucide-react'
import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { Board } from '@/components/board/Board'
import { moveSquares } from '@/features/training/moves'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { formatScore, LIVE_LINES, type ShownLine } from '../liveEngine'
import type { StudyNode } from '../tree'
import type { WhiteScore } from '@/features/review/errors'

/**
 * The live engine: on or off (off, no evaluation at all), the position's evaluation and depth, then its best lines. A click
 * on a move of a line plays the line up to it; the lines hold still while the mouse is over them,
 * so that a deeper search does not move the move about to be clicked. A move under the mouse shows
 * the position it leads to on a small board, below its line.
 */
export function EnginePanel({
  on,
  onToggle,
  node,
  score,
  depth,
  maxDepth,
  lines,
  failed,
  orientation,
  onPlay,
}: {
  on: boolean
  onToggle: (on: boolean) => void
  node: StudyNode
  /** The best line's score, the analysis's evaluation until it comes; none with the engine off */
  score: WhiteScore | undefined
  depth: number | undefined
  maxDepth: number
  lines: ShownLine[]
  failed: boolean
  /** The main board's, for the preview */
  orientation: Color
  onPlay: (moves: string[]) => void
}) {
  const [held, setHeld] = useState<{ fen: string; lines: ShownLine[] }>()
  const shown = held?.fen === node.fen ? held.lines : lines
  const [preview, setPreview] = useState<Preview>()
  const listRef = useRef<HTMLOListElement>(null)
  const showPreview = (event: PointerEvent<HTMLButtonElement>, fen: string, uci: string) => {
    // A mouse only: on a touch screen, the tap plays the move.
    if (event.pointerType !== 'mouse' || !listRef.current) return
    const list = listRef.current.getBoundingClientRect()
    const move = event.currentTarget.getBoundingClientRect()
    const left = Math.max(0, Math.min(move.left - list.left, list.width - PREVIEW_SIZE))
    setPreview({ fen, uci, top: move.bottom - list.top + 4, left })
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          {node.over ? (
            <span className="text-base font-medium text-text-strong">{m.study_game_over()}</span>
          ) : (
            on && (
              <span
                className={cn(
                  'num rounded-md border px-2 text-2xl font-semibold',
                  score ? scoreChip(score) : WHITE_CHIP,
                )}
              >
                {score ? formatScore(score) : '…'}
              </span>
            )
          )}
          {on && !node.over && depth !== undefined && (
            <span className="num text-xs text-muted-foreground">
              {m.study_depth({ depth: formatNumber(depth), max: formatNumber(maxDepth) })}
            </span>
          )}
        </div>
        <EngineSwitch on={on} onToggle={onToggle} />
      </div>
      {failed ? (
        <p className="text-sm text-loss">{m.training_engine_failed()}</p>
      ) : (
        on &&
        !node.over && (
          // The preview beside the list, not in it: a list item more would change its spacing
          // (and move the moves below).
          <div className="relative">
            <ol
              ref={listRef}
              className="space-y-1 text-sm"
              onMouseEnter={() => lines.length > 0 && setHeld({ fen: node.fen, lines })}
              onMouseLeave={() => {
                setHeld(undefined)
                setPreview(undefined)
              }}
            >
              {Array.from({ length: LIVE_LINES }, (_, index) => {
                const line = shown[index]
                return (
                  <li
                    key={index}
                    className="flex h-6 items-center gap-1.5 overflow-hidden rounded-sm border border-border-strong/40 bg-raised px-1.5"
                  >
                    {line ? (
                      <>
                        <span
                          className={cn(
                            'num w-11 shrink-0 rounded-sm border px-1 text-center text-xs leading-4 font-semibold',
                            scoreChip(line.score),
                          )}
                        >
                          {formatScore(line.score)}
                        </span>
                        <span className="min-w-0 truncate text-xs" title={lineText(node, line)}>
                          {line.moves.map((move, at) => {
                            const label = moveLabel(node, at)
                            return (
                              <span key={at}>
                                {label && (
                                  <span className="num text-muted-foreground">{label}</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreview(undefined)
                                    onPlay(line.moves.slice(0, at + 1).map((item) => item.uci))
                                  }}
                                  onPointerEnter={(event) => showPreview(event, move.fen, move.uci)}
                                  onPointerLeave={() => setPreview(undefined)}
                                  className="rounded-sm px-px text-text-strong hover:bg-primary hover:text-primary-foreground"
                                >
                                  {move.san}
                                </button>{' '}
                              </span>
                            )
                          })}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">…</span>
                    )}
                  </li>
                )
              })}
            </ol>
            {preview && <PreviewBoard preview={preview} orientation={orientation} />}
          </div>
        )
      )}
    </div>
  )
}

const WHITE_CHIP = 'border-piece-white bg-piece-white text-piece-black'
const BLACK_CHIP = 'border-border-strong bg-piece-black text-piece-white'

/**
 * An evaluation's chip, in the colors of the side ahead: white when White is better (or equal),
 * black when Black is; it stands out from the moves next to it.
 */
function scoreChip(score: WhiteScore): string {
  const black = 'mate' in score ? score.mate < 0 : score.cp < 0
  return black ? BLACK_CHIP : WHITE_CHIP
}

/** "Stockfish" and its on / off switch. */
export function EngineSwitch({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      <Cpu className="size-3.5" aria-hidden />
      {m.study_engine()}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={m.study_engine_toggle()}
        onClick={() => onToggle(!on)}
        className={cn(
          'relative h-5 w-9 rounded-full border transition-colors',
          on ? 'border-primary bg-primary' : 'border-border-strong bg-field',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3.5 rounded-full transition-[left]',
            on ? 'left-[1.1rem] bg-primary-foreground' : 'left-0.5 bg-muted-foreground',
          )}
        />
      </button>
    </div>
  )
}

/** The preview's width, in pixels */
const PREVIEW_SIZE = 200

type Preview = { fen: string; uci: string; top: number; left: number }

/** The position after a line's move, over what follows the lines; it cannot be played on. */
function PreviewBoard({ preview, orientation }: { preview: Preview; orientation: Color }) {
  const config = useMemo(
    () => ({
      fen: preview.fen,
      orientation,
      viewOnly: true,
      coordinates: false,
      lastMove: moveSquares(preview.uci) as [Key, Key],
      drawable: { enabled: false },
    }),
    [preview.fen, preview.uci, orientation],
  )
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-20 overflow-hidden rounded-sm border border-border-strong shadow-lg"
      style={{ top: preview.top, left: preview.left, width: PREVIEW_SIZE }}
    >
      <Board config={config} />
    </div>
  )
}

/** The number before a line's move: every White move, and the first one when it is Black's. */
function moveLabel(node: StudyNode, at: number): string | undefined {
  // The line starts with the side to move in `node`, at its FEN's move counter.
  const counter = Number(node.fen.split(' ')[5] ?? 1)
  if (node.turn === 'white') return at % 2 === 0 ? `${counter + at / 2}.` : undefined
  if (at === 0) return `${counter}…`
  return at % 2 === 1 ? `${counter + (at + 1) / 2}.` : undefined
}

function lineText(node: StudyNode, line: ShownLine): string {
  return line.moves
    .map((move, at) => [moveLabel(node, at), move.san].filter(Boolean).join(' '))
    .join(' ')
}
