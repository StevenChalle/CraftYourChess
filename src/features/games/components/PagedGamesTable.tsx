import { useRef, useState } from 'react'
import { TablePagination } from '@/components/TablePagination'
import { GamePanel } from '@/features/review/components/GamePanel'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import { reviewedGameKey, useAnalysisSession } from '@/features/review/sessionContext'
import { trackedReview, useTracker } from '@/features/review/tracker'
import { useCachedReviews } from '@/features/review/useCachedReviews'
import { useKeptScroll } from '@/hooks/useKeptScroll'
import { pageSlice } from '@/lib/pagination'
import { loadPageSize, PAGE_SIZES, savePageSize } from '../pageSize'
import { m } from '@/paraglide/messages'
import { ReviewLink } from '@/features/study/components/ReviewLink'
import { AnalysisProgress } from './AnalysisInPlace'
import { AnalyzeLink } from './AnalyzeLink'
import { MistakesCount } from './MistakesCount'
import { GamesTable } from './GamesTable'

/**
 * Games already in memory, in their order (newest first), 20 per page or as many as chosen (kept
 * in this browser), the arrows under the list. A game is analysed right where it is, after those
 * asked before it: a loader in its button, its row opens on the steps, then on the game as soon as
 * it is judged, deepening on its own (its errors counted again as it goes). The background
 * analysis's games show the same way (tracker.ts). A game analysed before shows its errors and
 * opens onto its evaluation chart, as in the analysis's results (judged from the cache with the
 * analysis's criteria). New games arriving keep the page shown.
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
  const { draft, trainGame, gameList, setGameList, player, analyzeGame, stopGame } =
    useAnalysisSession()
  const tracked = useTracker()
  const wanted = gameList.page
  const setWanted = (page: number) => setGameList((view) => ({ ...view, page }))
  const [pageSize, setPageSize] = useState(loadPageSize)
  const page = Math.min(wanted, Math.max(0, Math.ceil(games.length / pageSize) - 1))
  const shown = pageSlice(games, page, pageSize)
  // Read again whenever an analysis or a deepening ends.
  const reviewed = useCachedReviews(shown, draft.criteria, String(tracked.revision))
  const [openNow, setOpenNow] = useState<{ key: string }>()
  const reviewOf = (game: ReviewGame) =>
    trackedReview(tracked, gameRef(game), draft.criteria, reviewed.get(gameRef(game)))
  /** Analysed, waiting or under way: not judged yet */
  const analysing = (game: ReviewGame) => {
    const active = tracked.active.get(gameRef(game))
    return active !== undefined && active.review === undefined ? active : undefined
  }
  const failed = (game: ReviewGame) => player.failed.has(gameRef(game))
  const rootRef = useRef<HTMLDivElement>(null)

  // The window's scroll, kept as the list is left, and put back on return once the list (and the
  // game open, which makes the page taller) is there again.
  useKeptScroll(
    gameList.scrollY,
    gameList.open === undefined || reviewed.size > 0 || tracked.results.size > 0,
    (scrollY) => setGameList((view) => ({ ...view, scrollY })),
  )

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
            canOpen: (game) =>
              reviewOf(game) !== undefined || analysing(game) !== undefined || failed(game),
            openNow,
            render: (game) => {
              const review = reviewOf(game)
              if (!review) {
                return (
                  <AnalysisProgress
                    analysis={analysing(game)}
                    failed={failed(game)}
                    onStop={() => stopGame(gameRef(game))}
                  />
                )
              }
              return (
                review && (
                  <GamePanel
                    game={review}
                    deepen={false}
                    ratingChange={ratingChange(game)}
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
            shortHeader: m.review_col_errors_short(),
            cell: (game) => {
              const review = reviewOf(game)
              const live = tracked.active.get(gameRef(game))?.review !== undefined
              return review && <MistakesCount count={review.mistakes.length} live={live} />
            },
          }}
          action={(game) => {
            const review = reviewOf(game)
            const busy = analysing(game) !== undefined
            return (
              <>
                <ReviewLink game={game} compact />
                <AnalyzeLink
                  analysed={review !== undefined}
                  disabled={review !== undefined && review.mistakes.length === 0}
                  compact
                  busy={busy}
                  onTrain={() => review && trainGame(review.mistakes, draft.criteria)}
                  onAnalyze={() => {
                    analyzeGame(game)
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
