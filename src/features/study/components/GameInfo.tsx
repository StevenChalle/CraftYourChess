import type { Color } from 'chessops'
import { SideSquare } from '@/features/games/components/GamesTable'
import { timeControlLabel } from '@/features/games/normalize'
import { SourceLabel } from '@/features/player/components/SourceBadge'
import { categoryLabel } from '@/features/player/sources'
import type { ReviewGame } from '@/features/review/games'
import { formatDate, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** "1-0", "0-1", "½-½": the game's result as written on a score sheet. */
function scoreOf(game: Pick<ReviewGame, 'result' | 'color'>): string {
  if (game.result === 'draw') return '½-½'
  const whiteWon = (game.result === 'win') === (game.color === 'white')
  return whiteWon ? '1-0' : '0-1'
}

/**
 * The game being studied: both players (White first) with their ratings and the result, then its
 * opening, platform, time control and date. `player`: the reviewed player's name.
 */
export function GameInfo({ game, player }: { game: ReviewGame; player: string | undefined }) {
  const side = (color: Color) =>
    color === game.color
      ? { name: player ?? '?', rating: game.rating, strong: true }
      : { name: game.opponent.name, rating: game.opponent.rating, strong: false }
  const score = scoreOf(game)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-sm">
          {(['white', 'black'] as const).map((color) => {
            const { name, rating, strong } = side(color)
            return (
              <p key={color} className="flex min-w-0 items-center gap-2">
                <SideSquare color={color} />
                <span className={cn('truncate', strong ? 'font-medium text-text-strong' : '')}>
                  {name}
                </span>
                {rating !== undefined && (
                  <span className="num text-xs text-muted-foreground">{formatNumber(rating)}</span>
                )}
              </p>
            )
          })}
        </div>
        <span
          className={cn(
            'num shrink-0 text-lg font-semibold',
            game.result === 'win' ? 'text-win' : game.result === 'loss' ? 'text-loss' : '',
          )}
        >
          {score}
        </span>
      </div>
      {game.opening && (
        <p className="truncate text-xs text-text-strong" title={game.opening.name}>
          {game.opening.name}
          {game.opening.eco && (
            <span className="num ml-2 text-muted-foreground">{game.opening.eco}</span>
          )}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <SourceLabel source={game.source} />
        <span>·</span>
        <span>
          {categoryLabel(game.category)}{' '}
          <span className="num">{timeControlLabel(game.timeControl)}</span>
        </span>
        {!game.undated && (
          <>
            <span>·</span>
            <span className="num">{formatDate(game.playedAt)}</span>
          </>
        )}
      </p>
    </div>
  )
}
