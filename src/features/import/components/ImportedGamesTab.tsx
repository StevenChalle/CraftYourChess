import { useMemo } from 'react'
import { PagedGamesTable } from '@/features/games/components/PagedGamesTable'
import { latestGames } from '@/features/review/games'
import { m } from '@/paraglide/messages'
import { useImportedGames } from '../store'

/**
 * The imported games, newest first (undated ones last, in the file's order), as the profile lists
 * its games, without the rating chart: a file mixes players and platforms.
 */
export function ImportedGamesTab() {
  const imported = useImportedGames()
  const games = useMemo(
    () => (imported ? latestGames(imported.games, imported.games.length) : []),
    [imported],
  )
  if (games.length === 0) return <p className="text-muted-foreground">{m.history_no_games()}</p>
  return <PagedGamesTable games={games} usernames={{ import: true }} />
}
