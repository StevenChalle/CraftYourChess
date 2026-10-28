import { createFileRoute, Navigate } from '@tanstack/react-router'
import { PlayerOverview } from '@/features/player/components/PlayerOverview'

export const Route = createFileRoute('/player/')({
  component: function OverviewTab() {
    const search = Route.useSearch()
    // Imported games have no overview: their games instead.
    if (search.import) return <Navigate to="/player/history" search={{ import: true }} replace />
    return <PlayerOverview usernames={{ lichess: search.lichess, chesscom: search.chesscom }} />
  },
})
