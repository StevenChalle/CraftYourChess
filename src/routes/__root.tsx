import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  createRootRouteWithContext,
  Link,
  Outlet,
  useLocation,
  useSearch,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Footer } from '@/components/Footer'
import { FeedbackButton } from '@/components/FeedbackLink'
import { SettingsMenu } from '@/components/SettingsMenu'
import { Toaster } from '@/components/Toaster'
import { UpdateBanner } from '@/components/UpdateBanner'
import { BackgroundProvider } from '@/features/background/BackgroundProvider'
import { BackgroundIndicator } from '@/features/background/components/BackgroundIndicator'
import { InstallButton } from '@/components/InstallButton'
import { AccountSearchForm } from '@/features/player/components/AccountSearchForm'
import { validatePlayerSearch } from '@/features/player/search'
import { usePageMeta } from '@/hooks/usePageMeta'
import { m } from '@/paraglide/messages'

type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
})

function RootLayout() {
  const isHome = useLocation({ select: (location) => location.pathname === '/' })

  return (
    <BackgroundProvider>
      <div className="flex min-h-dvh flex-col">
        <UpdateBanner />
        <header className="header-etabli">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:gap-6">
            {/* The name as a wordmark: brand, not translated. A little smaller on a phone, for the
                header's buttons (install, feedback, background, settings) to fit at 360 px. */}
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5 font-brand text-xl font-bold tracking-tight text-brand sm:gap-3 sm:text-2xl"
            >
              <img
                src={`${import.meta.env.BASE_URL}pwa-64x64.png`}
                alt=""
                className="size-9 sm:size-10"
              />
              <span>
                Craft<span className="font-light text-brand-accent">Your</span>Chess
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2 sm:gap-4">
              {!isHome && <HeaderSearch />}
              <FeedbackButton />
              <InstallButton />
              <BackgroundIndicator />
              <SettingsMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Outlet />
        </main>
        <Footer />
        <Toaster />
        {import.meta.env.DEV && (
          <>
            <TanStackRouterDevtools position="bottom-left" />
            <ReactQueryDevtools buttonPosition="bottom-right" />
          </>
        )}
      </div>
    </BackgroundProvider>
  )
}

/**
 * Compact two-field search on wide screens, prefilled with the accounts currently shown. None on
 * a phone: no room in the header (the home page has the search).
 */
function HeaderSearch() {
  const current = validatePlayerSearch(useSearch({ strict: false }))
  return (
    <AccountSearchForm
      // Reset the fields whenever the linked accounts in the URL change.
      key={`${current.lichess ?? ''}|${current.chesscom ?? ''}`}
      initial={current}
      variant="compact"
      className="hidden md:flex"
    />
  )
}

/** Any unknown path: the host serves the app with a 200, so keep such pages out of search results. */
function NotFound() {
  usePageMeta({ noindex: true })
  return <p className="p-8 text-muted-foreground">{m.not_found()}</p>
}
