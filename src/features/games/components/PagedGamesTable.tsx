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
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import { AnalyzeLink } from './AnalyzeLink'
import { GamesTable } from './GamesTable'

const PAGE_SIZE = 20

/**
 * Games already in memory, in their order (newest first), 20 per page, the arrows above and under
 * the list; each with its link to the analysis. A game analysed before shows its errors and opens
 * onto its evaluation chart, as in the analysis's results (judged from the cache with the
 * analysis's criteria). New games arriving keep the page shown. `usernames`: the accounts
 * searched, or the import, for the links.
 */
export function PagedGamesTable({
  games,
  usernames,
}: {
  games: ReviewGame[]
  usernames: ProfileSearch
}) {
  const [wanted, setWanted] = useState(0)
  const page = Math.min(wanted, Math.max(0, Math.ceil(games.length / PAGE_SIZE) - 1))
  const shown = pageSlice(games, page, PAGE_SIZE)
  const { draft } = useAnalysisSession()
  const reviewed = useCachedReviews(shown, draft.criteria)
  const rootRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={rootRef} className="scroll-mt-4 space-y-3">
      <TablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={games.length}
        onPageChange={setWanted}
      />
      <div className="panel-etabli px-2">
        <GamesTable
          games={shown}
          expandable={{
            canOpen: (game) => reviewed.has(gameRef(game)),
            render: (game) => {
              const review = reviewed.get(gameRef(game))
              return review && <GamePanel game={review} deepen={false} />
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
              <AnalyzeLink
                game={game}
                usernames={usernames}
                analysed={review !== undefined}
                disabled={review?.mistakes.length === 0}
              />
            )
          }}
        />
      </div>
      {/* Under the list, a new page starts back at its top. */}
      <TablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={games.length}
        onPageChange={(next) => {
          setWanted(next)
          rootRef.current?.scrollIntoView({ block: 'start' })
        }}
      />
    </div>
  )
}
