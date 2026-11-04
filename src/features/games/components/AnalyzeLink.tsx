import { Link } from '@tanstack/react-router'
import { LoaderCircle, Microscope, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GameSummary } from '@/features/games/normalize'
import type { ProfileSearch } from '@/features/player/search'
import { gameRef } from '@/features/review/gameRef'
import { m } from '@/paraglide/messages'

/**
 * Analyses this game where it is (`onAnalyze`, a loader in the button while `busy`). Already
 * analysed: straight to its training (the analysis comes back from the cache at once); `disabled`
 * when it has no error to replay, or while another game is analysed. `size` 'sm': larger, its label always shown. `compact`: the training as an icon alone.
 */
export function AnalyzeLink({
  game,
  usernames,
  analysed = false,
  disabled = false,
  size = 'xs',
  compact = false,
  onAnalyze,
  busy = false,
}: {
  game: GameSummary
  usernames: ProfileSearch
  analysed?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm'
  compact?: boolean
  onAnalyze?: () => void
  busy?: boolean
}) {
  const label = size === 'xs' ? 'max-sm:sr-only' : undefined
  if (analysed && compact) {
    const icon = <Swords className="size-3.5" />
    return disabled ? (
      <Button size="icon-xs" disabled title={m.replay_game()} aria-label={m.replay_game()}>
        {icon}
      </Button>
    ) : (
      <Button size="icon-xs" asChild>
        <Link
          to="/player/results"
          search={{ ...usernames, game: gameRef(game), train: true }}
          title={m.replay_game()}
          aria-label={m.replay_game()}
        >
          {icon}
        </Link>
      </Button>
    )
  }
  if (analysed && disabled) {
    return (
      <Button size={size} disabled title={m.replay_game()}>
        <Swords data-icon="inline-start" />
        <span className={label}>{m.replay_game_short()}</span>
      </Button>
    )
  }
  if (analysed) {
    return (
      <Button size={size} asChild>
        <Link
          to="/player/results"
          search={{ ...usernames, game: gameRef(game), train: true }}
          title={m.replay_game()}
        >
          <Swords data-icon="inline-start" />
          <span className={label}>{m.replay_game_short()}</span>
        </Link>
      </Button>
    )
  }
  return (
    <Button
      size={size}
      // While busy, not greyed out: its loader says the analysis runs.
      onClick={busy ? undefined : onAnalyze}
      disabled={disabled}
      aria-busy={busy}
      title={m.history_analyze_title()}
    >
      {busy ? (
        <LoaderCircle data-icon="inline-start" className="animate-spin" />
      ) : (
        <Microscope data-icon="inline-start" />
      )}
      <span className={label}>{m.history_analyze()}</span>
    </Button>
  )
}
