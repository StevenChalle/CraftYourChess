import { Link } from '@tanstack/react-router'
import { CircleCheck, Layers, LoaderCircle, Pause, Play, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { formatGameCount, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { SourceDot } from '@/features/player/components/SourceBadge'
import { useBackground } from '../backgroundContext'
import { playerAccounts, playerName, useFavorites } from '../favorites'
import type { BackgroundPhase, BackgroundState } from '../runner'

/** When not working: up to date, paused (by the player, or waiting), or failed. */
const ICONS: Record<BackgroundPhase, typeof Pause> = {
  starting: LoaderCircle,
  elsewhere: CircleCheck,
  syncing: LoaderCircle,
  analysing: LoaderCircle,
  deepening: LoaderCircle,
  'up-to-date': CircleCheck,
  busy: Pause,
  paused: Pause,
  'rate-limited': Pause,
  failed: TriangleAlert,
}

function statusText({ phase, done = 0, total = 0 }: BackgroundState): string {
  switch (phase) {
    case 'starting':
      return m.background_starting()
    case 'elsewhere':
      return total > 0
        ? m.background_elsewhere_progress({ done: formatNumber(done), total: formatNumber(total) })
        : m.background_elsewhere()
    case 'syncing':
      return m.background_syncing()
    case 'analysing':
      return m.background_analysing({ done: formatNumber(done), total: formatNumber(total) })
    case 'deepening':
      return m.background_deepening({ done: formatNumber(done), total: formatNumber(total) })
    case 'up-to-date':
      return m.background_up_to_date({ games: formatGameCount(total) })
    case 'busy':
      return m.background_busy()
    case 'paused':
      return m.background_paused()
    case 'rate-limited':
      return m.background_rate_limited()
    case 'failed':
      return m.background_failed()
  }
}

/**
 * How far a favorite's games are, their counts in its tooltip. With the deep option, two halves
 * with a notch between them: the quick analysis, then the deepening, lighter.
 */
function FavoriteBar({
  name,
  games,
  analysed,
  deepened,
  loading,
}: {
  name: string
  games: number
  analysed: number
  deepened: number | undefined
  loading: boolean
}) {
  // No game to analyse: nothing left to do, once they are fetched.
  const percent = (count: number) => (games === 0 ? (loading ? 0 : 100) : (count / games) * 100)
  const counts = { analysed: formatNumber(analysed), games: formatNumber(games) }
  const detail =
    deepened === undefined
      ? m.favorite_progress(counts)
      : m.favorite_progress_deep({ ...counts, deepened: formatNumber(deepened) })
  const shimmer = loading || undefined
  return (
    <div title={detail} className="flex flex-1 gap-0.5">
      <Progress
        value={percent(analysed)}
        data-loading={shimmer}
        aria-label={`${name} · ${detail}`}
        className="flex-1"
      />
      {deepened !== undefined && (
        <Progress
          value={percent(deepened)}
          data-loading={shimmer}
          aria-hidden
          className="flex-1 [&>[data-fill]]:opacity-55"
        />
      )}
    </div>
  )
}

/** Working, or another tab is: the icon spins and the bars of loading favorites move. */
function isWorking({ phase, done, total }: BackgroundState): boolean {
  if (phase === 'elsewhere') return total === undefined || (done ?? 0) < total
  return (
    phase === 'starting' || phase === 'syncing' || phase === 'analysing' || phase === 'deepening'
  )
}

/**
 * In the header, when there are favorites: an icon only (working, up to date, paused, failed),
 * the details on click: each favorite (a link to their profile) with a bar of how far their games are, the number of games
 * followed on the right, the state in words with the same icon, and a button to pause for the
 * session (docs/background-analysis.md).
 */
export function BackgroundIndicator() {
  const background = useBackground()
  const favorites = useFavorites()
  // Closed when a favorite's profile is opened from it.
  const [open, setOpen] = useState(false)
  if (!background || !favorites) return null
  const { state, pause, resume } = background
  const working = isWorking(state)
  const Icon = working ? LoaderCircle : ICONS[state.phase]
  const iconClass = cn(
    working && 'animate-spin text-primary',
    state.phase === 'up-to-date' && 'text-win',
    state.phase === 'failed' && 'text-loss',
  )
  // In the settings' order, with their current options; before a first report, all loading.
  const rows = favorites.players.map((player) => {
    const name = playerName(player)
    const progress = state.players?.find((item) => item.name === name)
    return {
      name,
      search: { lichess: player.lichess, chesscom: player.chesscom },
      accounts: playerAccounts(player),
      max: player.depth,
      games: progress?.games ?? 0,
      analysed: progress?.analysed ?? 0,
      // Only with the deep option, even before a first report.
      deepened: player.deep ? (progress?.deepened ?? 0) : undefined,
      loading: working && (progress?.loading ?? true),
    }
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={m.background_title()}
          title={statusText(state)}
          className="text-muted-foreground hover:text-text-strong"
        >
          <Icon className={iconClass} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-sm">
        <ul className="space-y-2.5">
          {rows.map(({ name, search, accounts, max, ...progress }) => (
            <li key={name} className="flex items-center gap-2">
              <span className="flex w-5 shrink-0 gap-1">
                {accounts.map(({ source }) => (
                  <SourceDot key={source} source={source} />
                ))}
              </span>
              <Link
                to="/player"
                search={search}
                title={m.favorite_open_profile({ player: name })}
                onClick={() => setOpen(false)}
                className="w-24 truncate font-medium text-text-strong hover:text-primary hover:underline"
              >
                {name}
              </Link>
              <FavoriteBar name={name} {...progress} />
              <span className="num w-10 text-right text-xs text-muted-foreground">
                {formatNumber(max)}
              </span>
            </li>
          ))}
        </ul>
        <p role="status" className="flex items-start gap-2 text-xs text-muted-foreground">
          <Icon aria-hidden className={cn('mt-px size-3.5 shrink-0', iconClass)} />
          {statusText(state)}
        </p>
        {/* Reassures while it works: the deep option does not start until every game is analysed. */}
        {working && favorites.players.some((player) => player.deep) && (
          // Layers: a second, deeper pass over the first.
          <p className="flex items-start gap-2 text-xs text-muted-foreground/80">
            <Layers aria-hidden className="mt-px size-3.5 shrink-0" />
            {m.background_deep_note()}
          </p>
        )}
        {state.phase === 'paused' ? (
          <Button variant="outline" size="sm" onClick={resume}>
            <Play data-icon="inline-start" />
            {m.background_resume()}
          </Button>
        ) : (
          state.phase !== 'elsewhere' && (
            <Button variant="outline" size="sm" onClick={pause}>
              <Pause data-icon="inline-start" />
              {m.background_pause()}
            </Button>
          )
        )}
      </PopoverContent>
    </Popover>
  )
}
