import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { BackLink } from '@/components/BackLink'
import { AnalysisResults } from '@/features/review/components/AnalysisResults'
import { ReviewRecap } from '@/features/review/components/ReviewRecap'
import { ReviewSetup } from '@/features/review/components/ReviewSetup'
import { isSelectionValid } from '@/features/review/selection'
import { sameSettings, type ReviewSettings } from '@/features/review/settings'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/player/analysis')({
  component: AnalysisPage,
})

/** Time to wait after the last change before searching (typing a number, clicking chips…). */
const SEARCH_DELAY_MS = 400

/**
 * The advanced analysis, from the profile's button: back to the profile (which closes the
 * analysis), then its filters and options. Closed accounts have no games to analyse.
 */
function AnalysisPage() {
  const { accounts, library, usernames } = useAnalysisSession()
  const back = (
    <BackLink
      label={usernames.import ? m.study_back_import() : m.study_back_profile()}
      to={usernames.import ? '/player/history' : '/player'}
      search={usernames}
    />
  )
  return (
    <div className="space-y-4">
      {back}
      {library.kind === 'accounts' && accounts.length === 0 ? (
        <p className="text-muted-foreground">{m.analysis_unavailable()}</p>
      ) : (
        <AnalysisForm />
      )}
    </div>
  )
}

/**
 * Filters and options; the games they match show up below (searched again after every change),
 * with the button launching the analysis. Once launched, the sections fold away and the analysis
 * shows under the games found: its steps, then its results.
 */
function AnalysisForm() {
  const {
    accounts,
    library,
    gameTotal,
    draft,
    setDraft,
    search,
    analysis,
    analysisSettings,
    analysisId,
    find,
    launch,
  } = useAnalysisSession()

  // While the analysis fetches its games, wait: one Lichess request at a time.
  const analysisFetching = analysis.status === 'running' && analysis.progress.phase === 'fetching'
  const canSearch = search.status === 'idle' && isSelectionValid(draft.selection)
  useEffect(() => {
    if (!canSearch || analysisFetching) return
    const timer = setTimeout(find, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [canSearch, analysisFetching, find])

  // These filters and rules are those of the analysis below (running or done): launching it again
  // would only confuse.
  const launched =
    (analysis.status === 'running' || analysis.status === 'done') &&
    sameSettings(draft, analysis.settings)

  // Enter in a field launches the analysis: right away if the games are known, else as soon as
  // they are (searching now rather than after the delay). Remembered with the filters it was
  // pressed on: changing them again cancels it.
  const launchFor = useRef<ReviewSettings | undefined>(undefined)
  useEffect(() => {
    if (launchFor.current !== draft || search.status === 'finding' || search.status === 'idle')
      return
    launchFor.current = undefined
    if (search.status === 'found' && search.found.games.length > 0 && !launched) void launch()
  }, [draft, search, launch, launched])
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return
    event.preventDefault()
    if (!isSelectionValid(draft.selection)) return
    if (search.status === 'found') {
      if (search.found.games.length > 0 && !launched) void launch()
      return
    }
    launchFor.current = draft
    if (canSearch && !analysisFetching) find()
  }

  // Each analysis launched (or brought back by a reload): the filters fold away, its results in
  // sight.
  const open = analysis.status !== 'none'
  const resultsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Once per analysis, not as it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId])

  return (
    <div className="space-y-6" onKeyDown={onKeyDown}>
      <ReviewSetup
        folded={open ? analysisId : undefined}
        accounts={accounts}
        sources={library.sources}
        gameTotal={gameTotal}
        value={draft}
        onChange={setDraft}
        reference={analysisSettings}
      />
      {search.status === 'error' && <p className="text-loss">{m.search_failed()}</p>}
      {/* While the games are looked for again (or about to be), the box shows a loader. */}
      {(search.status === 'found' || search.status === 'finding' || canSearch) && (
        <ReviewRecap
          found={search.status === 'found' ? search.found : undefined}
          progress={search.status === 'finding' ? search.progress : undefined}
          criteria={draft.criteria}
          onLaunch={() => void launch()}
          launched={launched}
        />
      )}
      <div ref={resultsRef} className="scroll-mt-4">
        <AnalysisResults />
      </div>
    </div>
  )
}
