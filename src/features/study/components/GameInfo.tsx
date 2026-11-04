import type { Color } from 'chessops'
import { SideSquare } from '@/features/games/components/GamesTable'
import type { ReviewGame } from '@/features/review/games'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** "1-0", "0-1", "½-½": the game's result as written on a score sheet. */
function scoreOf(game: Pick<ReviewGame, 'result' | 'color'>): string {
  if (game.result === 'draw') return '½-½'
  const whiteWon = (game.result === 'win') === (game.color === 'white')
  return whiteWon ? '1-0' : '0-1'
}

/**
 * The game being studied: both players (White first) with their ratings and the result, then,
 * under a line, its opening. Each on a single line, cut short with an ellipsis rather than wrapped
 * (the full text on hover). `player`: the reviewed player's name.
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
        <div className="min-w-0 space-y-0.5 text-base">
          {(['white', 'black'] as const).map((color) => {
            const { name, rating, strong } = side(color)
            return (
              <p key={color} className="flex min-w-0 items-center gap-2">
                <SideSquare color={color} />
                <span
                  className={cn('truncate', strong ? 'font-medium text-text-strong' : '')}
                  title={name}
                >
                  {name}
                </span>
                {rating !== undefined && (
                  <span className="num shrink-0 text-sm text-muted-foreground">
                    {formatNumber(rating)}
                  </span>
                )}
              </p>
            )
          })}
        </div>
        <span
          className={cn(
            'num shrink-0 text-xl font-semibold',
            game.result === 'win' ? 'text-win' : game.result === 'loss' ? 'text-loss' : '',
          )}
        >
          {score}
        </span>
      </div>
      {game.opening && (
        <p className="flex min-w-0 items-baseline gap-2 border-t pt-2 text-sm text-text-strong">
          <span className="truncate" title={game.opening.name}>
            {game.opening.name}
          </span>
          {game.opening.eco && (
            <span className="num shrink-0 text-xs text-muted-foreground">{game.opening.eco}</span>
          )}
        </p>
      )}
    </div>
  )
}
