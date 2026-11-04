import { useRef, useState } from 'react'
import { TablePagination } from '@/components/TablePagination'
import type { ProfileSearch } from '@/features/player/search'
import { GamePanel } from '@/features/review/components/GamePanel'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { useCachedReviews } from '@/features/review/useCachedReviews'
import { formatNumber } from '@/lib/format'
import { pageSlice } from '@/lib/pagination'
import { loadPageSize, PAGE_SIZES, savePageSize } from '../pageSize'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { ReviewLink } from '@/features/study/components/ReviewLink'
import { AnalyzeLink } from './AnalyzeLink'
import { GamesTable } from './GamesTable'

/**
 * Games already in memory, in their order (newest first), 20 per page or as many as chosen (kept
 * in this browser), the arrows under the list;
 * each with its link to the analysis. A game analysed before shows its errors and opens onto its
 * evaluation chart, as in the analysis's results (judged from the cache with the
 * analysis's criteria). New games arriving keep the page shown. `usernames`: the accounts
 * searched, or the import, for the links.
 */
export function PagedGamesTable({
  games,
  usernames,
  oneRating = false,
}: {
  games: ReviewGame[]
  usernames: ProfileSearch
  /**
   * The games all count for the same rating (one platform, one time control, rated): each one's
   * change is from the game before it, when the platform does not say it (Chess.com)
   */
  oneRating?: boolean
}) {
  const [wanted, setWanted] = useState(0)
  const [pageSize, setPageSize] = useState(loadPageSize)
  const page = Math.min(wanted, Math.max(0, Math.ceil(games.length / pageSize) - 1))
  const shown = pageSlice(games, page, pageSize)
  const { draft, deepening } = useAnalysisSession()
  const reviewed = useCachedReviews(shown, draft.criteria, deepening?.gameKey)
  const rootRef = useRef<HTMLDivElement>(null)
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
            canOpen: (game) => reviewed.has(gameRef(game)),
            render: (game) => {
              const review = reviewed.get(gameRef(game))
              return (
                review && (
                  <GamePanel
                    game={review}
                    deepen={false}
                    ratingChange={ratingChange(game)}
                    train={
                      <AnalyzeLink
                        game={game}
                        usernames={usernames}
                        analysed
                        disabled={review.mistakes.length === 0}
                        size="sm"
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
              const review = reviewed.get(gameRef(game))
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
            const review = reviewed.get(gameRef(game))
            return (
              <>
                <ReviewLink game={game} compact className="max-sm:hidden" />
                <AnalyzeLink
                  game={game}
                  usernames={usernames}
                  analysed={review !== undefined}
                  disabled={review?.mistakes.length === 0}
                  compact
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
