import { useEffect, useRef, useState } from 'react'
import { TablePagination } from '@/components/TablePagination'
import { GamePanel } from '@/features/review/components/GamePanel'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import { reviewedGameKey, useAnalysisSession } from '@/features/review/sessionContext'
import { useCachedReviews } from '@/features/review/useCachedReviews'
import { formatNumber } from '@/lib/format'
import { pageSlice } from '@/lib/pagination'
import { loadPageSize, PAGE_SIZES, savePageSize } from '../pageSize'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { ReviewLink } from '@/features/study/components/ReviewLink'
import { useAnalysisHere } from '../useAnalysisHere'
import { AnalysisProgress } from './AnalysisInPlace'
import { AnalyzeLink } from './AnalyzeLink'
import { GamesTable } from './GamesTable'

/**
 * Games already in memory, in their order (newest first), 20 per page or as many as chosen (kept
 * in this browser), the arrows under the list. A game is analysed right where it is: its row opens
 * on the progress, then on the game. A game analysed before shows its errors and opens onto its
 * evaluation chart, as in the analysis's results (judged from the cache with the analysis's
 * criteria). New games arriving keep the page shown.
 */
export function PagedGamesTable({
  games,
  oneRating = false,
}: {
  games: ReviewGame[]
  /**
   * The games all count for the same rating (one platform, one time control, rated): each one's
   * change is from the game before it, when the platform does not say it (Chess.com)
   */
  oneRating?: boolean
}) {
  // The page and the game open live in the session: coming back from a review or a training finds
  // them again.
  const { draft, deepening, trainGame, gameList, setGameList } = useAnalysisSession()
  const wanted = gameList.page
  const setWanted = (page: number) => setGameList((view) => ({ ...view, page }))
  const [pageSize, setPageSize] = useState(loadPageSize)
  const page = Math.min(wanted, Math.max(0, Math.ceil(games.length / pageSize) - 1))
  const shown = pageSlice(games, page, pageSize)
  // Read again once a game is deepened, by the session or in its panel.
  const [deepened, setDeepened] = useState(0)
  const reviewed = useCachedReviews(shown, draft.criteria, `${deepening?.gameKey}:${deepened}`)
  // A game analysed right here: its row opens on the progress, then on the game once analysed.
  const here = useAnalysisHere(() => setDeepened((count) => count + 1))
  const [openNow, setOpenNow] = useState<{ key: string }>()
  const reviewOf = (game: ReviewGame) =>
    reviewed.get(gameRef(game)) ?? here.analysed.get(gameRef(game))
  const rootRef = useRef<HTMLDivElement>(null)

  // Back on the list with a game open: that game in sight, once its row can open.
  const [restoredOpen] = useState(gameList.open)
  const scrolled = useRef(false)
  useEffect(() => {
    if (!restoredOpen || scrolled.current) return
    const row = rootRef.current?.querySelector(`[data-game="${CSS.escape(restoredOpen)}"]`)
    if (!row || ![...reviewed.keys(), ...here.analysed.keys()].length) return
    scrolled.current = true
    // Below the page's header, with a little room above.
    row.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -96)
  }, [restoredOpen, reviewed, here.analysed])

  const ratingChange = (game: ReviewGame): number | undefined => {
    if (game.ratingDiff !== undefined || !oneRating || game.rating === undefined) {
      return game.ratingDiff
    }
    const before = games[games.indexOf(game) + 1]?.rating
    return before === undefined ? undefined : game.rating - before
  }
  return (
    <div ref={rootRef} className="scroll-mt-4 space-y-3">
      <div className="panel-etabli px-2">
        <GamesTable
          games={shown}
          expandable={{
            defaultOpen: gameList.open,
            onToggle: (key, open) =>
              setGameList((view) =>
                open
                  ? { ...view, open: key }
                  : view.open === key
                    ? { ...view, open: undefined }
                    : view,
              ),
            canOpen: (game) => reviewOf(game) !== undefined || here.current?.ref === gameRef(game),
            openNow,
            render: (game) => {
              const review = reviewOf(game)
              if (!review && here.current?.ref === gameRef(game)) {
                return <AnalysisProgress state={here.current} onStop={here.stop} />
              }
              return (
                review && (
                  <GamePanel
                    game={review}
                    deepen={false}
                    ratingChange={ratingChange(game)}
                    onDeepened={() => setDeepened((count) => count + 1)}
                    train={
                      <AnalyzeLink
                        analysed
                        disabled={review.mistakes.length === 0}
                        size="sm"
                        onTrain={() => trainGame(review.mistakes, draft.criteria)}
                      />
                    }
                  />
                )
              )
            },
          }}
          extra={{
            header: m.review_col_errors(),
            cell: (game) => {
              const review = reviewOf(game)
              return (
                review && (
                  <span
                    className={cn(
                      'num text-base font-medium',
                      review.mistakes.length === 0 ? 'text-win' : 'text-loss',
                    )}
                  >
                    {formatNumber(review.mistakes.length)}
                  </span>
                )
              )
            },
          }}
          action={(game) => {
            const review = reviewOf(game)
            const busy = here.current?.ref === gameRef(game) && !here.current.failed
            return (
              <>
                <ReviewLink game={game} compact className="max-sm:hidden" />
                <AnalyzeLink
                  analysed={review !== undefined}
                  disabled={
                    review
                      ? review.mistakes.length === 0
                      : !busy && here.current !== undefined && !here.current.failed
                  }
                  compact
                  busy={busy}
                  onTrain={() => review && trainGame(review.mistakes, draft.criteria)}
                  onAnalyze={() => {
                    here.start(game)
                    setOpenNow({ key: reviewedGameKey(game) })
                    setGameList((view) => ({ ...view, open: reviewedGameKey(game) }))
                  }}
                />
              </>
            )
          }}
        />
      </div>
      {/* Under the list, a new page starts back at its top. */}
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={games.length}
        onPageChange={(next) => {
          setWanted(next)
          rootRef.current?.scrollIntoView({ block: 'start' })
        }}
        pageSizes={PAGE_SIZES}
        onPageSizeChange={(size) => {
          // The page holding the first game shown, at the new size.
          setWanted(Math.floor((page * pageSize) / size))
          setPageSize(size)
          savePageSize(size)
        }}
      />
    </div>
  )
}
