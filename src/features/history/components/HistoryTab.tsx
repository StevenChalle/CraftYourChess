import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Microscope, RefreshCw, Swords } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { GamesTable } from '@/features/games/components/GamesTable'
import type { GameSummary } from '@/features/games/normalize'
import type { PlayerUsernames, ProfileSearch } from '@/features/player/search'
import { sourceErrorMessage } from '@/features/player/sources'
import { gameRef } from '@/features/review/gameRef'
import { useAnalysedRefs } from '@/features/review/useAnalysedRefs'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { ALL_GAMES, HISTORY_PAGE_SIZE, type HistoryAccount } from '../feed'
import { historyKeys, historyQueryOptions } from '../queries'
import { HistoryFiltersBar, type HistoryFilters } from './HistoryFilters'

/**
 * The filters of each player, kept while the page is open (switching tabs unmounts this one), not
 * stored.
 */
const keptFilters = new Map<string, HistoryFilters>()

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
  const accountsKey = historyKeys.accounts(accounts).join('|')
  const [filters, setFilters] = useState<HistoryFilters>(
    () =>
      keptFilters.get(accountsKey) ?? {
        ...ALL_GAMES,
        sources: accounts.map((account) => account.source),
      },
  )
  const shownAccounts = useMemo(
    () => accounts.filter((account) => filters.sources.includes(account.source)),
    [accounts, filters.sources],
  )
  const filter = useMemo(
    () => ({ categories: filters.categories, results: filters.results }),
    [filters.categories, filters.results],
  )
  const query = useInfiniteQuery(historyQueryOptions(shownAccounts, filter))
  const [pageIndex, setPageIndex] = useState(0)
  const filtered =
    shownAccounts.length < accounts.length ||
    filters.categories.length > 0 ||
    filters.results.length < ALL_GAMES.results.length
  const changeFilters = (next: HistoryFilters) => {
    keptFilters.set(accountsKey, next)
    setFilters(next)
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
  const update = async () => {
    setPageIndex(0)
    // Every filter of these accounts: the others would show older games later.
    await queryClient.resetQueries({ queryKey: historyKeys.accounts(accounts) })
  }

  const from = pageIndex * HISTORY_PAGE_SIZE + 1
  const to = pageIndex * HISTORY_PAGE_SIZE + (page?.games.length ?? 0)

  return (
    <div className="space-y-4">
      <HistoryFiltersBar accounts={accounts} filters={filters} onChange={changeFilters} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {page && page.games.length > 0
            ? m.history_range({ from: formatNumber(from), to: formatNumber(to) })
            : null}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={update} disabled={query.isFetching}>
            <RefreshCw
              data-icon="inline-start"
              className={cn(query.isRefetching || query.isPending ? 'animate-spin' : undefined)}
            />
            {m.history_update()}
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((index) => index - 1)}
            aria-label={m.history_previous()}
            title={m.history_previous()}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={!canGoNext || query.isFetchingNextPage}
            onClick={goNext}
            aria-label={m.history_next()}
            title={m.history_next()}
          >
            {query.isFetchingNextPage ? <RefreshCw className="animate-spin" /> : <ChevronRight />}
          </Button>
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
      )}
    </div>
  )
}
