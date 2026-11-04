import { LoaderCircle, Play, Save } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SourceLabel } from '@/features/player/components/SourceBadge'
import { categoryLabel, sourceErrorMessage } from '@/features/player/sources'
import { detectDevice } from '@/lib/device'
import { formatEstimate, formatGameCount, formatNumber } from '@/lib/format'
import { GAME_CATEGORIES, type GameSource } from '@/features/games/normalize'
import { m } from '@/paraglide/messages'
import type { ReviewCriteria } from '../criteria'
import { analysisWorkLeft, type WorkLeft } from '../analyze'
import type { ReviewGame } from '../games'
import { deviceProfile, workSeconds, workSpeedup } from '../estimate'
import type { FetchProgress, FoundGames } from '../fetch'
import { LARGE_REVIEW } from '../selection'

const SOURCES: GameSource[] = ['lichess', 'chesscom', 'import']

/**
 * What the search found (shown under the filters), how long the analysis should take, and the
 * button to launch it (top right). `launched`: the analysis below already has these filters and
 * rules, launching it again would only confuse: the button waits for a change.
 */
export function ReviewRecap({
  found,
  progress,
  criteria,
  onLaunch,
  launched = false,
}: {
  /** undefined while the games are being looked for: the box shows a loader instead */
  found?: FoundGames
  /** How far the search is, platform by platform, while it runs */
  progress?: FetchProgress
  criteria: ReviewCriteria
  onLaunch: () => void
  launched?: boolean
}) {
  if (!found) {
    return (
      <div className="rounded-md bg-muted/50 p-4" role="status">
        <RecapHeader launchDisabled onLaunch={onLaunch}>
          <span className="flex items-center gap-2 text-lg text-muted-foreground">
            <LoaderCircle aria-hidden className="size-5 animate-spin" />
            {m.setup_finding()}
          </span>
          {progress && <SearchProgress progress={progress} />}
        </RecapHeader>
      </div>
    )
  }
  return <FoundRecap found={found} criteria={criteria} onLaunch={onLaunch} launched={launched} />
}

/**
 * The search's progress: one bar for all platforms (the mean of their shares), the games found on
 * each, and why Lichess is slow (its export streams about 20 games per second).
 */
function SearchProgress({ progress }: { progress: FetchProgress }) {
  const sources = (['lichess', 'chesscom'] as const).flatMap((source) => {
    const item = progress[source]
    return item ? [{ source, ...item }] : []
  })
  if (sources.length === 0) return null
  const ratio = sources.reduce((sum, { ratio }) => sum + ratio, 0) / sources.length
  return (
    <div className="w-64 max-w-full space-y-1.5">
      <Progress value={ratio * 100} aria-label={m.setup_finding()} />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {sources.map(({ source, games }) => (
          <span key={source} className="inline-flex items-center gap-1.5">
            <SourceLabel source={source} />
            <span className="num text-muted-foreground">{formatGameCount(games)}</span>
          </span>
        ))}
      </p>
      {progress.lichess && progress.lichess.ratio < 1 && (
        <p className="text-xs text-muted-foreground">{m.setup_finding_lichess_speed()}</p>
      )}
    </div>
  )
}

/** The box's top: its title and what it holds, the button launching the analysis on the right. */
function RecapHeader({
  launchDisabled = false,
  launchHint,
  onLaunch,
  children,
}: {
  launchDisabled?: boolean
  /** Under the button: why it waits */
  launchHint?: string
  onLaunch: () => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-3">
        <p className="label-etabli">{m.recap_title()}</p>
        {children}
      </div>
      <div className="flex flex-col items-end gap-1">
        <Button size="lg" disabled={launchDisabled} onClick={onLaunch}>
          <Play data-icon="inline-start" />
          {m.recap_launch()}
        </Button>
        {launchHint && (
          <p className="max-w-56 text-right text-xs text-muted-foreground">{launchHint}</p>
        )}
      </div>
    </div>
  )
}

function FoundRecap({
  found: { games, failures },
  criteria,
  onLaunch,
  launched,
}: {
  found: FoundGames
  criteria: ReviewCriteria
  onLaunch: () => void
  launched: boolean
}) {
  // The estimate is for the device running the analysis: its kind and its engines.
  const device = detectDevice()
  const profile = deviceProfile(device)
  // What is left to compute, the analysis cache taken into account (looked up once per search),
  // kept with what it was computed for: another search shows "estimating" until its own arrives.
  const [computed, setComputed] = useState<
    { games: ReviewGame[]; criteria: ReviewCriteria; work: WorkLeft } | undefined
  >(undefined)
  useEffect(() => {
    let current = true
    void analysisWorkLeft(games, criteria).then((work) => {
      if (current) setComputed({ games, criteria, work })
    })
    return () => {
      current = false
    }
  }, [games, criteria])
  const work =
    computed?.games === games && computed.criteria === criteria ? computed.work : undefined
  const seconds = work && workSeconds(work, criteria, profile)
  // Nothing left to compute: the details of why, and the note on long analyses, would only repeat it.
  const ready = seconds === 0
  // On a phone or a tablet: how much faster a computer would be.
  const speedup = work && device === 'mobile' ? workSpeedup(work, criteria, profile) : undefined
  const bySource = SOURCES.map((source) => ({
    source,
    count: games.filter((game) => game.source === source).length,
  })).filter(({ count }) => count > 0)
  // Their evaluations are reused: already left out of the estimate.
  const serverAnalysed = games.filter((game) => game.serverCps !== undefined).length
  const byCategory = GAME_CATEGORIES.map((category) => ({
    category,
    count: games.filter((game) => game.category === category).length,
  })).filter(({ count }) => count > 0)

  return (
    <div className="space-y-4">
      {failures.map(({ source, error }) => (
        <p key={source} className="text-sm text-loss">
          {sourceErrorMessage(source, error)}
        </p>
      ))}

      {games.length === 0 ? (
        <p className="text-muted-foreground">{m.recap_none()}</p>
      ) : (
        <div className="space-y-3 rounded-md bg-muted/50 p-4">
          <RecapHeader
            onLaunch={onLaunch}
            launchDisabled={launched}
            launchHint={launched ? m.recap_launched() : undefined}
          >
            <p className="num text-2xl font-medium text-text-strong">
              {formatGameCount(games.length)}
            </p>
          </RecapHeader>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {bySource.map(({ source, count }) => (
              <span key={source} className="inline-flex items-center gap-1.5">
                <SourceLabel source={source} />
                <span className="num text-muted-foreground">{formatNumber(count)}</span>
              </span>
            ))}
            {byCategory.map(({ category, count }) => (
              <span key={category} className="text-muted-foreground">
                {categoryLabel(category)} <span className="num">{formatNumber(count)}</span>
              </span>
            ))}
          </p>
          <div className="space-y-0.5 pt-1">
            <p className="text-text-strong">
              {seconds === undefined
                ? m.recap_estimating()
                : seconds === 0
                  ? m.recap_estimate_ready()
                  : m.recap_estimate({ time: formatEstimate(seconds) })}
            </p>
            {speedup !== undefined && (
              <p className="text-sm text-text-strong">
                {m.recap_faster_on_desktop({ times: String(speedup) })}
              </p>
            )}
            {work && work.fromCache > 0 && !ready && (
              <p className="text-xs text-muted-foreground">
                {m.recap_cached({ count: work.fromCache, formatted: formatNumber(work.fromCache) })}
              </p>
            )}
            {serverAnalysed > 0 && !ready && (
              <p className="text-xs text-muted-foreground">
                {m.recap_server_analysed({
                  count: serverAnalysed,
                  formatted: formatNumber(serverAnalysed),
                })}
              </p>
            )}
          </div>
          {games.length >= LARGE_REVIEW && !ready && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Save aria-hidden className="size-3.5 shrink-0" />
              {m.recap_progress_saved()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
