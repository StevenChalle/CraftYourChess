import { LogOut } from 'lucide-react'
import { createFileRoute, Navigate, Outlet, useBlocker, useLocation } from '@tanstack/react-router'
import { useMemo } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PlayerHeader } from '@/features/player/components/PlayerHeader'
import { PlayerTabs } from '@/features/player/components/PlayerTabs'
import { useRememberSearch } from '@/features/player/recentSearches'
import {
  hasAnyUsername,
  type ProfileSearch,
  usernamesLabel,
  validatePlayerSearch,
} from '@/features/player/search'
import { usePlayerAccounts } from '@/features/player/usePlayerAccounts'
import { reviewableAccounts } from '@/features/review/accounts'
import { ReviewButtons } from '@/features/review/components/ReviewButtons'
import { parseGameRef } from '@/features/review/gameRef'
import { accountsLibrary, importLibrary } from '@/features/review/library'
import { ImportHeader } from '@/features/import/components/ImportHeader'
import { useImportedGames } from '@/features/import/store'
import { FavoriteButton } from '@/features/background/components/FavoriteButton'
import { AnalysisSessionProvider } from '@/features/review/session'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { TrainingView } from '@/features/training/components/TrainingView'
import { usePageMeta } from '@/hooks/usePageMeta'
import { chessComPlayerQueryOptions } from '@/lib/chesscom/queries'
import { formatOrList } from '@/lib/format'
import { lichessUserQueryOptions } from '@/lib/lichess/queries'
import { m } from '@/paraglide/messages'

type PlayerSearch = ProfileSearch & {
  /** "last": review the last game right away */
  start?: 'last'
  /** A game to review on its own right away (see gameRef.ts) */
  game?: string
  /** With `game`: then straight to the training of its mistakes (an analysed game) */
  train?: true
}

/**
 * /player?lichess=<name>&chesscom=<name>: either or both, names may differ. The profile and the
 * analysis of these accounts, in tabs: overview, games, analysis, its results, trainings.
 * /player?import=true: the same for the games imported last (no overview), never mixed with an
 * account's.
 */
export const Route = createFileRoute('/player')({
  validateSearch: (search: Record<string, unknown>): PlayerSearch => ({
    ...validatePlayerSearch(search),
    ...(search.import === true || search.import === 'true' ? { import: true as const } : {}),
    ...(search.start === 'last' ? { start: 'last' as const } : {}),
    ...(parseGameRef(search.game) ? { game: search.game as string } : {}),
    ...(parseGameRef(search.game) && (search.train === true || search.train === 'true')
      ? { train: true as const }
      : {}),
  }),
  loaderDeps: ({ search }) => ({ lichess: search.lichess, chesscom: search.chesscom }),
  // prefetchQuery never throws: each source handles its own failure in the UI.
  loader: ({ context: { queryClient }, deps }) =>
    Promise.all([
      deps.lichess && queryClient.prefetchQuery(lichessUserQueryOptions(deps.lichess)),
      deps.chesscom && queryClient.prefetchQuery(chessComPlayerQueryOptions(deps.chesscom)),
    ]),
  component: PlayerLayout,
  pendingComponent: () => <p className="text-muted-foreground">{m.player_loading()}</p>,
})

function PlayerLayout() {
  const search = Route.useSearch()
  return search.import ? (
    <ImportLayout start={search.start} game={search.game} train={search.train} />
  ) : (
    <AccountsLayout />
  )
}

/** Imported games: the same tabs, but no overview and no account. */
function ImportLayout({ start, game, train }: { start?: 'last'; game?: string; train?: true }) {
  const imported = useImportedGames()
  const library = useMemo(() => imported && importLibrary(imported.games), [imported])
  usePageMeta({ title: m.import_page_title(), noindex: true })
  // Nothing is kept: after a reload, back to the home page to import again.
  if (!imported || !library) return <Navigate to="/" replace />
  const search = { import: true } as const
  return (
    <AnalysisSessionProvider
      key={imported.id}
      accounts={[]}
      library={library}
      gameTotal={imported.games.length}
      usernames={search}
      start={start}
      game={game}
      train={train}
    >
      <div className="space-y-6">
        <ImportHeader imported={imported} actions={<ReviewButtons usernames={search} />} />
        <PlayerTabs usernames={search} canAnalyse />
        <Trainings />
        <Outlet />
      </div>
      <LeaveGuard usernames={search} />
    </AnalysisSessionProvider>
  )
}

function AccountsLayout() {
  const { lichess, chesscom, start, game, train } = Route.useSearch()
  const usernames = useMemo(() => ({ lichess, chesscom }), [lichess, chesscom])
  const { linked, accounts, noAccount } = usePlayerAccounts(usernames)
  usePageMeta({ title: usernamesLabel(usernames) || undefined, noindex: true })
  const reviewable = useMemo(() => reviewableAccounts(accounts), [accounts])
  const library = useMemo(() => accountsLibrary(reviewable.accounts), [reviewable.accounts])

  useRememberSearch(accounts)

  if (!hasAnyUsername(usernames)) {
    return <p className="text-muted-foreground">{m.player_need_username()}</p>
  }

  if (noAccount) {
    const names = formatOrList(linked.map((source) => m.quoted({ text: usernames[source]! })))
    return <p className="text-muted-foreground">{m.player_not_found({ names })}</p>
  }

  return (
    // A new session for other accounts.
    <AnalysisSessionProvider
      key={`${lichess ?? ''}|${chesscom ?? ''}`}
      accounts={reviewable.accounts}
      library={library}
      gameTotal={reviewable.gameTotal}
      usernames={usernames}
      start={start}
      game={game}
      train={train}
    >
      <div className="space-y-6">
        <PlayerHeader
          accounts={accounts}
          profileLink={usernames}
          nameAction={<FavoriteButton accounts={reviewable.accounts} />}
          actions={reviewable.accounts.length > 0 && <ReviewButtons usernames={usernames} />}
        />
        <PlayerTabs usernames={usernames} canAnalyse={reviewable.accounts.length > 0} />
        <Trainings />
        <Outlet />
      </div>
      <LeaveGuard usernames={usernames} />
    </AnalysisSessionProvider>
  )
}

/**
 * Trainings stay mounted while another tab is shown: each goes on where it was (only the one on
 * screen runs its engine). Placed before the tab content so the board never moves when that
 * content changes.
 */
function Trainings() {
  const { trainings, restartTraining, replayMissed, setTrainingFinished, showResults } =
    useAnalysisSession()
  const pathname = useLocation({ select: (location) => location.pathname })
  return trainings.map((tab) => {
    if (tab.phase.kind !== 'running') return null
    const shown = pathname === `/player/training/${tab.number}`
    return (
      <div key={tab.number} hidden={!shown}>
        <TrainingView
          key={tab.phase.run}
          puzzles={tab.phase.puzzles}
          exercises={tab.phase.exercises ?? tab.phase.settings.exercises}
          validMaxDrop={tab.validMaxDrop}
          active={shown}
          onFinishedChange={(finished) => setTrainingFinished(tab.number, finished)}
          onRestart={() => restartTraining(tab.number)}
          onReplayMissed={(puzzles) => replayMissed(tab.number, puzzles)}
          onExit={showResults}
        />
      </div>
    )
  })
}

/**
 * Nothing is saved yet: leaving the page during an analysis or an unfinished training asks first,
 * other accounts included. Switching tabs is never blocked.
 */
function LeaveGuard({ usernames }: { usernames: ProfileSearch }) {
  const { analysis, trainings } = useAnalysisSession()
  const busy =
    analysis.status === 'running' ||
    trainings.some((tab) => tab.phase.kind === 'running' && !tab.finished)
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) => {
      if (!busy) return false
      if (!next.pathname.startsWith('/player')) return true
      const search = next.search as ProfileSearch
      return (
        search.lichess !== usernames.lichess ||
        search.chesscom !== usernames.chesscom ||
        Boolean(search.import) !== Boolean(usernames.import)
      )
    },
    enableBeforeUnload: () => busy,
    withResolver: true,
  })
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      options={{
        icon: LogOut,
        title: m.confirm_leave_title(),
        description: m.confirm_leave_body(),
        confirmLabel: m.confirm_leave_action(),
        cancelLabel: m.confirm_cancel(),
      }}
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  )
}
