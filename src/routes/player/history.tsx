import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ImportedGamesTab } from '@/features/import/components/ImportedGamesTab'

/**
 * The imported games. An account's games are under its rating chart, in the overview: the old
 * address of their tab leads there.
 */
export const Route = createFileRoute('/player/history')({
  component: function GamesTab() {
    const search = Route.useSearch()
    if (search.import) return <ImportedGamesTab />
    return (
      <Navigate
        to="/player"
        search={{ lichess: search.lichess, chesscom: search.chesscom }}
        replace
      />
    )
  },
})
