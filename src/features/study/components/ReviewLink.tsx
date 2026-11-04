import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GameSummary } from '@/features/games/normalize'
import { gameRef } from '@/features/review/gameRef'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'

/**
 * To the game's review page (board, engine, variations), at the half-move `ply`. A labelled
 * button, or an icon alone on a background (`compact`) where room is short.
 */
export function ReviewLink({
  game,
  ply = 0,
  compact = false,
  size = 'xs',
  className,
}: {
  game: GameSummary
  ply?: number
  compact?: boolean
  /** The labelled button's */
  size?: 'xs' | 'sm'
  className?: string
}) {
  const { usernames } = useAnalysisSession()
  return (
    <Button
      asChild
      variant={compact ? 'secondary' : 'outline'}
      size={compact ? 'icon-xs' : size}
      className={cn(compact && '[&_svg]:size-3.5', className)}
    >
      <Link
        to="/player/review"
        search={{ ...usernames, review: gameRef(game), ply }}
        title={m.study_review_title()}
        aria-label={m.study_review_title()}
      >
        <Search data-icon={compact ? undefined : 'inline-start'} />
        {!compact && m.study_review()}
      </Link>
    </Button>
  )
}
