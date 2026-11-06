import { LoaderCircle } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'

/**
 * The mistakes column of an analysed game, the same in every list: none in green, else in red.
 * `live`: the game is being deepened, the count may still change (a small loader beside it).
 */
export function MistakesCount({ count, live = false }: { count: number; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {live && (
        <LoaderCircle
          className="size-3 animate-spin text-muted-foreground"
          aria-label={m.mistakes_live()}
        />
      )}
      <span className={cn('num text-base font-medium', count === 0 ? 'text-win' : 'text-loss')}>
        {formatNumber(count)}
      </span>
    </span>
  )
}
