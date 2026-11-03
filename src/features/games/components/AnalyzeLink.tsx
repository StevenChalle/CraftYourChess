import { Link } from '@tanstack/react-router'
import { Microscope, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GameSummary } from '@/features/games/normalize'
import type { ProfileSearch } from '@/features/player/search'
import { gameRef } from '@/features/review/gameRef'
import { m } from '@/paraglide/messages'

/**
 * Straight to the analysis of this game alone, then its training. Already analysed: straight to
 * the training (the analysis comes back from the cache at once); `disabled` when it has no error
 * to replay.
 */
export function AnalyzeLink({
  game,
  usernames,
  analysed = false,
  disabled = false,
}: {
  game: GameSummary
  usernames: ProfileSearch
  analysed?: boolean
  disabled?: boolean
}) {
  if (analysed && disabled) {
    return (
      <Button size="xs" disabled title={m.replay_game()}>
        <Swords data-icon="inline-start" />
        <span className="max-sm:sr-only">{m.replay_game_short()}</span>
      </Button>
    )
  }
  if (analysed) {
    return (
      <Button size="xs" asChild>
        <Link
          to="/player/results"
          search={{ ...usernames, game: gameRef(game), train: true }}
          title={m.replay_game()}
        >
          <Swords data-icon="inline-start" />
          <span className="max-sm:sr-only">{m.replay_game_short()}</span>
        </Link>
      </Button>
    )
  }
  return (
    <Button size="xs" asChild>
      <Link
        to="/player/results"
        search={{ ...usernames, game: gameRef(game) }}
        title={m.history_analyze_title()}
      >
        <Microscope data-icon="inline-start" />
        <span className="max-sm:sr-only">{m.history_analyze()}</span>
      </Link>
    </Button>
  )
}
