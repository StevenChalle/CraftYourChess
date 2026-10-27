import { Link } from '@tanstack/react-router'
import { History, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ApiSource } from '@/lib/http'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { MAX_STORED, useRecentSearches } from '../recentSearches'
import type { PlayerUsernames } from '../search'
import { SourceDot } from './SourceBadge'

/**
 * Last profile searches, one click to reopen them or to review their last game. Hidden until there
 * is at least one.
 */
export function RecentSearches({ className }: { className?: string }) {
  const { searches, remove } = useRecentSearches(MAX_STORED)
  if (searches.length === 0) return null

  return (
    <section className={cn('rounded-lg border border-border', className)}>
      <h2 className="label-etabli flex items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground">
        <History className="size-3.5" />
        {m.recent_searches()}
      </h2>
      {/* Every search kept, three in sight: the older ones are a scroll away, with a thin dark
          scrollbar and no track. */}
      <ul className="max-h-[7.25rem] [scrollbar-width:thin] [scrollbar-color:var(--cyc-raised)_transparent] space-y-0.5 overflow-y-auto overscroll-contain p-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-raised [&::-webkit-scrollbar-track]:bg-transparent">
        {searches
          .map(({ lichess, chesscom }) => ({ lichess, chesscom }))
          .map((usernames) => (
            <li
              key={`${usernames.lichess ?? ''}|${usernames.chesscom ?? ''}`}
              className="group flex items-center rounded-md transition-colors hover:bg-muted"
            >
              <Link
                to="/player/history"
                search={usernames}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 px-2 py-1.5 text-sm text-text-strong"
              >
                <AccountNames usernames={usernames} />
              </Link>
              <Button variant="ghost" size="xs" asChild className="text-muted-foreground">
                <Link
                  to="/player/results"
                  search={{ ...usernames, start: 'last' }}
                  title={m.review_button_last()}
                >
                  <Play data-icon="inline-start" />
                  {m.recent_last_game()}
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => remove(usernames)}
                aria-label={m.recent_remove({ names: describe(usernames) })}
                title={m.recent_remove({ names: describe(usernames) })}
                // Always visible on touch screens, revealed on hover elsewhere
                className="mr-1 text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0"
              >
                <X />
              </Button>
            </li>
          ))}
      </ul>
    </section>
  )
}

function describe(usernames: PlayerUsernames): string {
  return [usernames.lichess, usernames.chesscom].filter(Boolean).join(' / ')
}

/** "● ● name" when both accounts share a name, "● a  ● b" otherwise. */
function AccountNames({ usernames }: { usernames: PlayerUsernames }) {
  const { lichess, chesscom } = usernames
  if (lichess && chesscom && lichess.toLowerCase() === chesscom.toLowerCase()) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <SourceDot source="lichess" />
        <SourceDot source="chesscom" className="-ml-1" />
        {lichess}
      </span>
    )
  }
  const entries = (['lichess', 'chesscom'] as ApiSource[]).flatMap((source) => {
    const name = usernames[source]
    return name ? [{ source, name }] : []
  })
  return entries.map(({ source, name }) => (
    <span key={source} className="inline-flex min-w-0 items-center gap-1.5">
      <SourceDot source={source} />
      <span className="truncate">{name}</span>
    </span>
  ))
}
