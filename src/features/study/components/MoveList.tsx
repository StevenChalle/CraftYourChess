import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { formatMoveTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import type { MoveNote } from '../study'
import { getNode, moveNumber, ROOT, type StudyNode, type StudyTree } from '../tree'

type Row =
  | { kind: 'moves'; number: number; white?: StudyNode; black?: StudyNode }
  | { kind: 'variations'; starts: string[] }

/**
 * The main line, two moves a row as on a score sheet. Where variations leave it, the row ends
 * after the move they replace and the variations come in between, the next row starting with
 * "…" when it is Black's move.
 */
function mainRows(tree: StudyTree): Row[] {
  const rows: Row[] = []
  let open: Extract<Row, { kind: 'moves' }> | undefined
  let node = getNode(tree, ROOT)
  for (let next = node.children[0]; next !== undefined; next = node.children[0]) {
    const parent = node
    node = getNode(tree, next)
    const { number, white } = moveNumber(node)
    if (white || !open || open.number !== number) {
      open = { kind: 'moves', number }
      rows.push(open)
    }
    if (white) open.white = node
    else open.black = node
    if (parent.children.length > 1) {
      rows.push({ kind: 'variations', starts: parent.children.slice(1) })
      open = undefined
    }
  }
  return rows
}

/**
 * The moves of the game and of the variations played on it. The game's moves show the player's
 * errors (red), the opponent's (a ring), and the time spent; variations are inline, in brackets
 * when nested, as on Lichess. Each move goes to its position; the one on screen stays in sight.
 */
export function MoveList({
  tree,
  current,
  notes,
  onSelect,
  className,
}: {
  tree: StudyTree
  current: string
  notes: MoveNote[]
  onSelect: (id: string) => void
  className?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    const move = list?.querySelector<HTMLElement>(`[data-node="${CSS.escape(current)}"]`)
    if (!list) return
    if (!move) {
      if (current === ROOT) list.scrollTop = 0
      return
    }
    // Within the list only (its moves are placed relative to it): the page itself does not move.
    const top = move.offsetTop
    if (top < list.scrollTop) list.scrollTop = top - 8
    else if (top + move.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + move.offsetHeight - list.clientHeight + 8
    }
  }, [current, tree])

  const rows = mainRows(tree)
  const move = (node: StudyNode, inline: boolean): ReactNode => {
    const note = node.inGame ? notes[node.ply] : undefined
    return (
      <button
        key={node.id}
        type="button"
        data-node={node.id}
        onClick={() => onSelect(node.id)}
        className={cn(
          'rounded-sm px-1 text-left transition-colors hover:bg-raised',
          inline ? 'inline' : 'flex w-full items-center justify-between gap-1 py-0.5',
          note?.mine ? 'text-loss' : 'text-text-strong',
          node.id === current && 'bg-primary text-primary-foreground hover:bg-primary',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {node.move?.san}
          {note?.theirs && (
            <span
              aria-label={m.eval_chart_their_mistake()}
              className={cn(
                'size-2 rounded-full border-[1.5px]',
                node.id === current ? 'border-primary-foreground' : 'border-muted-foreground',
              )}
            />
          )}
        </span>
        {!inline && note?.spent !== undefined && (
          <span
            className={cn(
              'num text-[11px]',
              node.id === current ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {formatMoveTime(note.spent)}
          </span>
        )}
      </button>
    )
  }

  /** A variation from `start`, inline, its own variations in brackets after the move they replace. */
  const line = (start: string): ReactNode[] => {
    const parts: ReactNode[] = []
    let node: StudyNode | undefined = getNode(tree, start)
    let numbered = true
    while (node) {
      const { number, white } = moveNumber(node)
      if (white || numbered) {
        parts.push(
          <span key={`n${node.id}`} className="num text-muted-foreground">
            {white ? `${number}.` : `${number}…`}
          </span>,
        )
      }
      parts.push(move(node, true))
      numbered = false
      const parent = getNode(tree, node.parent!)
      if (node.id !== start && parent.children[0] === node.id && parent.children.length > 1) {
        for (const alternative of parent.children.slice(1)) {
          parts.push(
            <span key={`v${alternative}`} className="text-muted-foreground">
              ({line(alternative)})
            </span>,
          )
        }
        numbered = true
      }
      node = node.children[0] ? getNode(tree, node.children[0]) : undefined
    }
    return parts.flatMap((part, index) => (index === 0 ? [part] : [' ', part]))
  }

  return (
    <div ref={listRef} className={cn('relative overflow-y-auto text-sm', className)}>
      {rows.length === 0 && <p className="p-2 text-muted-foreground">{m.study_no_moves()}</p>}
      <div className="grid grid-cols-[2.25rem_1fr_1fr]">
        {rows.map((row, index) =>
          row.kind === 'moves' ? (
            <div key={`r${index}`} className="contents">
              <span className="num border-r border-border bg-field py-0.5 pr-2 text-right text-muted-foreground">
                {row.number}
              </span>
              <div className="px-0.5">
                {row.white ? (
                  move(row.white, false)
                ) : (
                  <span className="px-1 text-muted-foreground">…</span>
                )}
              </div>
              <div className="px-0.5">{row.black && move(row.black, false)}</div>
            </div>
          ) : (
            <div
              key={`v${index}`}
              className="col-span-3 space-y-1 border-y border-border bg-background/40 px-3 py-1.5 text-[13px] leading-relaxed"
            >
              {row.starts.map((start) => (
                <p key={start}>{line(start)}</p>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  )
}
