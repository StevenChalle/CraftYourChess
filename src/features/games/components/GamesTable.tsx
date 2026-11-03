import type { Color } from 'chessops'
import { Fragment, useState, type MouseEvent, type ReactNode } from 'react'
import { ChevronDown, ExternalLink as ExternalLinkIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SourceLabel } from '@/features/player/components/SourceBadge'
import { categoryLabel, sourceLabel } from '@/features/player/sources'
import { formatDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import {
  timeControlLabel,
  variantLabel,
  type GameResult,
  type GameSummary,
} from '@/features/games/normalize'

const RESULTS: Record<GameResult, { label: () => string; className: string }> = {
  win: { label: m.result_win, className: 'text-win' },
  draw: { label: m.result_draw, className: 'text-muted-foreground' },
  loss: { label: m.result_loss, className: 'text-loss' },
}

/** Small square showing which side the player had. */
export function SideSquare({ color, className }: { color: Color; className?: string }) {
  const label = color === 'white' ? m.played_white() : m.played_black()
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-block size-3 shrink-0 rounded-sm border border-border',
        color === 'white' ? 'bg-piece-white' : 'bg-piece-black',
        className,
      )}
    />
  )
}

/**
 * Narrow screens keep, by priority: `extra` (the mistakes), time control, links, result, platform
 * (its dot only on phones). The opponent and then the date give way first: tapping a row there
 * shows them under its time control.
 */
const HIDE = { date: 'hidden md:table-cell', opponent: 'hidden sm:table-cell' }

/** More than the table ever has: a panel row spans them all. */
const COLUMNS = 99

/** Slides its content open or shut; the content only exists while open or sliding. */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open)
  // Opening mounts the content right away (state adjusted during render, not in an effect).
  if (open && !shown) setShown(true)
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && !open) setShown(false)
      }}
    >
      <div className="min-h-0 overflow-hidden">{(open || shown) && children}</div>
    </div>
  )
}

/** A column specific to one table (mistakes for the review). */
export type ExtraColumn<G> = { header: string; cell: (game: G) => ReactNode }

/**
 * Games, newest first: date, platform, time control, opponent, result, then `extra` if any. `action`
 * goes at the end of each row, before the link to the platform.
 */
export function GamesTable<G extends GameSummary>({
  games,
  extra,
  action,
  expandable,
}: {
  games: G[]
  extra?: ExtraColumn<G>
  action?: (game: G) => ReactNode
  /**
   * Rows that open onto a full-width panel, one at a time, with a slide (the narrow-screen
   * details then go into that panel). `onToggle` is told when one opens or closes. `canOpen`:
   * only some rows have a panel (the others keep their narrow-screen details).
   */
  expandable?: {
    render: (game: G) => ReactNode
    canOpen?: (game: G) => boolean
    onToggle?: (key: string, open: boolean) => void
    /** The row open at first */
    defaultOpen?: string
  }
}) {
  const [openKey, setOpenKey] = useState<string | undefined>(expandable?.defaultOpen)
  const toggleOpen = (key: string) => {
    if (openKey !== undefined) expandable?.onToggle?.(openKey, false)
    if (openKey !== key) expandable?.onToggle?.(key, true)
    setOpenKey(openKey === key ? undefined : key)
  }
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {expandable && (
            <TableHead className="w-6 px-1 sm:w-8 sm:px-2 sm:pr-0">
              <span className="sr-only">{m.games_row_details()}</span>
            </TableHead>
          )}
          <TableHead className={HIDE.date}>{m.review_col_date()}</TableHead>
          <TableHead>
            <span className="max-sm:sr-only">{m.review_col_platform()}</span>
          </TableHead>
          {/* On a phone, on two lines: the narrowest column is then the content's */}
          <TableHead className="max-sm:whitespace-normal">{m.review_col_time_control()}</TableHead>
          <TableHead className={HIDE.opponent}>{m.review_col_opponent()}</TableHead>
          <TableHead>{m.review_col_result()}</TableHead>
          {extra && <TableHead className="text-right">{extra.header}</TableHead>}
          <TableHead>
            <span className="sr-only">{m.review_col_link()}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody striped={!expandable}>
        {games.map((game, index) => {
          const result = RESULTS[game.result]
          const key = `${game.source}-${game.id}`
          const openable = expandable !== undefined && (expandable.canOpen?.(game) ?? true)
          const panelOpen = openable && openKey === key
          // Inline details on narrow screens, unless the row opens onto a panel.
          const open = !openable && expanded.has(key)
          // The whole row toggles its panel (or, where columns are hidden, its details), except
          // its links and buttons.
          const onRowClick = (event: MouseEvent) => {
            if ((event.target as Element).closest('a, button')) return
            if (openable) toggleOpen(key)
            else if (window.matchMedia('(width < 48rem)').matches) toggle(key)
          }
          const row = (
            <TableRow
              key={key}
              onClick={onRowClick}
              className={cn(
                openable && 'cursor-pointer',
                // Striped by hand: the panels' rows are not entries.
                expandable && index % 2 === 1 && 'bg-field',
              )}
            >
              {expandable && (
                <TableCell className="w-6 px-1 sm:w-8 sm:px-2 sm:pr-0">
                  {openable && (
                    <button
                      type="button"
                      aria-expanded={panelOpen}
                      aria-label={m.games_row_open()}
                      onClick={() => toggleOpen(key)}
                      className="align-middle text-muted-foreground hover:text-text-strong"
                    >
                      <ChevronDown
                        className={cn(
                          'size-4 transition-transform duration-200',
                          panelOpen && 'rotate-180',
                        )}
                      />
                    </button>
                  )}
                </TableCell>
              )}
              <TableCell className={cn('num whitespace-nowrap text-muted-foreground', HIDE.date)}>
                {/* An imported game may have no date */}
                {game.undated ? (
                  '—'
                ) : (
                  <>
                    {formatDate(game.playedAt)}{' '}
                    <span className="ml-1 text-muted-foreground/70">
                      {formatTime(game.playedAt)}
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell>
                <SourceLabel source={game.source} compact />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={m.games_row_details()}
                  onClick={() => toggle(key)}
                  className={cn(
                    'mr-1 align-middle text-muted-foreground md:hidden',
                    openable && 'hidden',
                  )}
                >
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                  />
                </button>
                {categoryLabel(game.category)}{' '}
                <span className="num text-muted-foreground">
                  {timeControlLabel(game.timeControl)}
                </span>
                {game.variant && (
                  <span className="block text-xs text-highlight">{variantLabel(game.variant)}</span>
                )}
                {open && (
                  <span className="mt-1 block space-y-0.5 md:hidden">
                    {!game.undated && (
                      <span className="num block whitespace-nowrap text-muted-foreground">
                        {formatDate(game.playedAt)} {formatTime(game.playedAt)}
                      </span>
                    )}
                    <span className="block sm:hidden">
                      <SourceLabel source={game.source} />
                    </span>
                    <span className="flex items-center gap-2 sm:hidden">
                      <SideSquare color={game.color} />
                      <span className="text-text-strong">{game.opponent.name}</span>
                      {game.opponent.rating !== undefined && (
                        <span className="num text-muted-foreground">{game.opponent.rating}</span>
                      )}
                    </span>
                  </span>
                )}
              </TableCell>
              <TableCell className={HIDE.opponent}>
                <span className="inline-flex items-center gap-2">
                  <SideSquare color={game.color} />
                  <span className="text-text-strong">{game.opponent.name}</span>
                  {game.opponent.rating !== undefined && (
                    <span className="num text-muted-foreground">{game.opponent.rating}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className={result.className}>{result.label()}</TableCell>
              {extra && <TableCell className="text-right">{extra.cell(game)}</TableCell>}
              <TableCell className="text-right whitespace-nowrap">
                {action?.(game)}
                {/* Imported games may have no page to link to */}
                {game.url && (
                  <a
                    href={game.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 inline-block align-middle text-muted-foreground hover:text-primary"
                    title={m.view_on({ platform: sourceLabel(game.source) })}
                    aria-label={m.view_on({ platform: sourceLabel(game.source) })}
                  >
                    <ExternalLinkIcon className="size-4" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          )
          if (!openable || !expandable) return row
          return (
            <Fragment key={key}>
              {row}
              <tr className="border-0">
                <td colSpan={COLUMNS} className="p-0">
                  <Collapse open={panelOpen}>
                    <div className="border-b border-border px-3 py-4">
                      {expandable.render(game)}
                    </div>
                  </Collapse>
                </td>
              </tr>
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
