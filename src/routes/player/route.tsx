import { CircleX, LogOut } from 'lucide-react'
import { createFileRoute, Navigate, Outlet, useBlocker, useLocation } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PlayerHeader } from '@/features/player/components/PlayerHeader'
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
import { ANALYSIS_PAGES, TRAINING_PAGE, useAnalysisSession } from '@/features/review/sessionContext'
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
  /** The review page's game (see gameRef.ts), and the half-move shown */
  review?: string
  ply?: number
}

/**
 * /player?lichess=<name>&chesscom=<name>: either or both, names may differ. The profile of these
 * accounts (rating chart and games), and its pages under the same header: the advanced analysis
 * (filters, then its results), a training, a game's review. /player?import=true: the same for the
 * games imported last (their list instead of the profile), never mixed with an account's.
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
    ...(parseGameRef(search.review) ? { review: search.review as string } : {}),
    ...(parseGameRef(search.review) &&
    Number.isInteger(Number(search.ply)) &&
    Number(search.ply) >= 0
      ? { ply: Number(search.ply) }
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
        <ImportHeader imported={imported} actions={<HeaderActions usernames={search} />} />
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
          actions={reviewable.accounts.length > 0 && <HeaderActions usernames={usernames} />}
        />
        <Outlet />
      </div>
      <LeaveGuard usernames={usernames} />
    </AnalysisSessionProvider>
  )
}

/** The advanced analysis's button, but on its own page and the training's. */
function HeaderActions({ usernames }: { usernames: ProfileSearch }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  if (pathname === '/player/analysis' || pathname === TRAINING_PAGE) return null
  return <ReviewButtons usernames={usernames} />
}

/**
 * Leaving the training page while the training is under way (some position played, not all), or
 * the analysis's pages while it runs (for other accounts too), asks first: they close. A reload
 * asks nothing: both come back.
 */
function LeaveGuard({ usernames }: { usernames: ProfileSearch }) {
  const { analysis, training } = useAnalysisSession()
  const [reason, setReason] = useState<'training' | 'analysis'>('analysis')
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      const search = next.search as ProfileSearch
      const otherProfile =
        !next.pathname.startsWith('/player') ||
        search.lichess !== usernames.lichess ||
        search.chesscom !== usernames.chesscom ||
        Boolean(search.import) !== Boolean(usernames.import)
      const trainingLeft =
        current.pathname === TRAINING_PAGE && (next.pathname !== TRAINING_PAGE || otherProfile)
      // Only a training with positions played has something to lose.
      if (
        trainingLeft &&
        training?.phase.kind === 'running' &&
        !training.finished &&
        (training.progress?.index ?? 0) > 0
      ) {
        setReason('training')
        return true
      }
      if (
        analysis.status === 'running' &&
        (otherProfile || !ANALYSIS_PAGES.includes(next.pathname))
      ) {
        setReason('analysis')
        return true
      }
      return false
    },
    // A reload brings the analysis and the training back: the browser need not ask.
    enableBeforeUnload: false,
    withResolver: true,
  })
  const options =
    reason === 'training'
      ? {
          icon: CircleX,
          title: m.confirm_close_training_title(),
          description: m.confirm_close_training_body(),
          confirmLabel: m.confirm_close_training_action(),
          cancelLabel: m.confirm_cancel(),
        }
      : {
          icon: LogOut,
          title: m.confirm_leave_title(),
          description: m.confirm_leave_body(),
          confirmLabel: m.confirm_leave_action(),
          cancelLabel: m.confirm_cancel(),
        }
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      options={options}
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  )
}
