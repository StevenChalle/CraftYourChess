import { Cpu } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { formatScore, LIVE_LINES, type ShownLine } from '../liveEngine'
import type { StudyNode } from '../tree'
import type { WhiteScore } from '@/features/review/errors'

/**
 * The live engine: on or off, the position's evaluation and depth, then its best lines. A click
 * on a move of a line plays the line up to it.
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
  onPlay,
}: {
  on: boolean
  onToggle: (on: boolean) => void
  node: StudyNode
  /** The best line's score, or the analysis's evaluation when the engine is off */
  score: WhiteScore | undefined
  depth: number | undefined
  maxDepth: number
  lines: ShownLine[]
  failed: boolean
  onPlay: (moves: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          {node.over ? (
            <span className="text-base font-medium text-text-strong">{m.study_game_over()}</span>
          ) : (
            <span className="num text-2xl font-semibold text-text-strong">
              {score ? formatScore(score) : '…'}
            </span>
          )}
          {on && !node.over && depth !== undefined && (
            <span className="num text-xs text-muted-foreground">
              {m.study_depth({ depth: formatNumber(depth), max: formatNumber(maxDepth) })}
            </span>
          )}
        </div>
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
      </div>
      {failed ? (
        <p className="text-sm text-loss">{m.training_engine_failed()}</p>
      ) : (
        on &&
        !node.over && (
          <ol className="space-y-1 text-sm">
            {Array.from({ length: LIVE_LINES }, (_, index) => {
              const line = lines[index]
              return (
                <li
                  key={index}
                  className="flex h-6 items-center gap-2 overflow-hidden rounded-sm bg-field px-2"
                >
                  {line ? (
                    <>
                      <span
                        className={cn(
                          'num w-12 shrink-0 font-medium',
                          'mate' in line.score
                            ? line.score.mate > 0
                              ? 'text-text-strong'
                              : 'text-muted-foreground'
                            : 'text-text-strong',
                        )}
                      >
                        {formatScore(line.score)}
                      </span>
                      <span className="min-w-0 truncate" title={lineText(node, line)}>
                        {line.moves.map((move, at) => {
                          const label = moveLabel(node, at)
                          return (
                            <span key={at}>
                              {label && <span className="num text-muted-foreground">{label} </span>}
                              <button
                                type="button"
                                onClick={() =>
                                  onPlay(line.moves.slice(0, at + 1).map((item) => item.uci))
                                }
                                className="rounded-sm px-0.5 text-text-strong hover:bg-raised"
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
        )
      )}
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
