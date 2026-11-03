import { useRef, useState } from 'react'
import { TablePagination } from '@/components/TablePagination'
import type { ProfileSearch } from '@/features/player/search'
import { gameRef } from '@/features/review/gameRef'
import type { ReviewGame } from '@/features/review/games'
import { useAnalysedRefs } from '@/features/review/useAnalysedRefs'
import { pageSlice } from '@/lib/pagination'
import { AnalyzeLink } from './AnalyzeLink'
import { GamesTable } from './GamesTable'

const PAGE_SIZE = 20

/**
 * Games already in memory, in their order (newest first), 20 per page, the arrows above and under
 * the list; each with its link to the analysis. New games arriving keep the page shown.
 * `usernames`: the accounts searched, or the import, for those links.
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
  const analysed = useAnalysedRefs(shown)
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
          action={(game) => (
            <AnalyzeLink game={game} usernames={usernames} analysed={analysed.has(gameRef(game))} />
          )}
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
