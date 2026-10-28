import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Microscope, RefreshCw, Swords } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GamesTable } from '@/features/games/components/GamesTable'
import type { GameSummary } from '@/features/games/normalize'
import type { PlayerUsernames, ProfileSearch } from '@/features/player/search'
import { sourceErrorMessage } from '@/features/player/sources'
import { gameRef } from '@/features/review/gameRef'
import { useAnalysedRefs } from '@/features/review/useAnalysedRefs'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { ALL_GAMES, type HistoryAccount } from '../feed'
import { historyKeys, historyQueryOptions } from '../queries'
import { profileKey } from '@/features/player/profileSettings'
import {
  loadHistoryFilters,
  saveHistoryFilters,
  shownAccounts as platformsShown,
  type HistoryFilters,
} from '../filters'
import { HistoryFiltersBar } from './HistoryFilters'

/**
 * Straight to the analysis of this game alone, then its training. Already analysed: straight to
 * the training (the analysis comes back from the cache at once).
 */
export function AnalyzeLink({
  game,
  usernames,
  analysed = false,
}: {
  game: GameSummary
  usernames: ProfileSearch
  analysed?: boolean
}) {
  if (analysed) {
    return (
      <Button size="xs" asChild>
        <Link
          to="/player/results"
          search={{ ...usernames, game: gameRef(game), train: true }}
          title={m.replay_game()}
        >
          <Swords data-icon="inline-start" />
          <span className="max-sm:sr-only">{m.replay_game_short()}</span>
        </Link>
      </Button>
    )
  }
  return (
    <Button size="xs" asChild>
      <Link
        to="/player/results"
        search={{ ...usernames, game: gameRef(game) }}
        title={m.history_analyze_title()}
      >
        <Microscope data-icon="inline-start" />
        <span className="max-sm:sr-only">{m.history_analyze()}</span>
      </Link>
    </Button>
  )
}

/**
 * Every game of the linked accounts, newest first, 30 per page; older pages load on demand.
 * `usernames`: the accounts searched, for the links to the analysis.
 */
export function HistoryTab({
  accounts,
  usernames,
}: {
  accounts: HistoryAccount[]
  usernames: PlayerUsernames
}) {
  const queryClient = useQueryClient()
  const profile = profileKey(usernames)
  const [saved, setSaved] = useState(() => loadHistoryFilters(profile))
  const shownAccounts = useMemo(() => platformsShown(accounts, saved), [accounts, saved])
  const filters: HistoryFilters = {
    ...saved,
    sources: shownAccounts.map((account) => account.source),
  }
  const filter = useMemo(
    () => ({ categories: saved.categories, results: saved.results }),
    [saved.categories, saved.results],
  )
  const query = useInfiniteQuery(historyQueryOptions(shownAccounts, filter))
  const [pageIndex, setPageIndex] = useState(0)
  const filtered =
    shownAccounts.length < accounts.length ||
    saved.categories.length > 0 ||
    saved.results.length < ALL_GAMES.results.length
  const changeFilters = (next: HistoryFilters) => {
    saveHistoryFilters(profile, next)
    setSaved(next)
    setPageIndex(0)
  }
  const pages = query.data?.pages ?? []
  const page = pages[pageIndex]
  const analysed = useAnalysedRefs(page?.games ?? [])
  const failures = pages.at(-1)?.state.failures ?? []
  const canGoNext = pageIndex + 1 < pages.length || query.hasNextPage

  const goNext = async () => {
    if (pageIndex + 1 >= pages.length) {
      const result = await query.fetchNextPage()
      if (result.isError) return
    }
    setPageIndex((index) => index + 1)
  }
  const rootRef = useRef<HTMLDivElement>(null)
  /** Under the list, a new page starts back at its top. */
  const arrows = (fromBottom = false) => {
    const turned = () => fromBottom && rootRef.current?.scrollIntoView({ block: 'start' })
    return (
      <>
        <Button
          variant="outline"
          size="icon"
          disabled={pageIndex === 0}
          onClick={() => {
            setPageIndex((index) => index - 1)
            turned()
          }}
          aria-label={m.history_previous()}
          title={m.history_previous()}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!canGoNext || query.isFetchingNextPage}
          onClick={async () => {
            await goNext()
            turned()
          }}
          aria-label={m.history_next()}
          title={m.history_next()}
        >
          {query.isFetchingNextPage ? <RefreshCw className="animate-spin" /> : <ChevronRight />}
        </Button>
      </>
    )
  }
  const update = async () => {
    setPageIndex(0)
    // Every filter of these accounts: the others would show older games later.
    await queryClient.resetQueries({ queryKey: historyKeys.accounts(accounts) })
  }

  return (
    <div ref={rootRef} className="scroll-mt-4 space-y-4">
      {/* The filters, and the buttons on their right while there is room */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <HistoryFiltersBar accounts={accounts} filters={filters} onChange={changeFilters} />
        <div className="ml-auto flex items-center gap-2">
          {/* Icon only: the filters need the room */}
          <Button
            variant="outline"
            size="icon"
            onClick={update}
            disabled={query.isFetching}
            aria-label={m.history_update()}
            title={m.history_update()}
          >
            <RefreshCw
              className={cn(query.isRefetching || query.isPending ? 'animate-spin' : undefined)}
            />
          </Button>
          {arrows()}
        </div>
      </div>

      {failures.map(({ source, error }) => (
        <p key={source} className="text-sm text-loss">
          {sourceErrorMessage(source, error)}
        </p>
      ))}

      {query.isPending ? (
        <p className="text-muted-foreground">{m.loading()}</p>
      ) : query.isError && pages.length === 0 ? (
        <p className="text-loss">{m.history_failed()}</p>
      ) : !page || page.games.length === 0 ? (
        <p className="text-muted-foreground">
          {canGoNext
            ? m.history_none_yet()
            : filtered
              ? m.history_no_match()
              : m.history_no_games()}
        </p>
      ) : (
        <>
          <div className="panel-etabli px-2">
            <GamesTable
              games={page.games}
              action={(game) => (
                <AnalyzeLink
                  game={game}
                  usernames={usernames}
                  analysed={analysed.has(gameRef(game))}
                />
              )}
            />
          </div>
          <div className="flex justify-end gap-2">{arrows(true)}</div>
        </>
      )}
    </div>
  )
}
