import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The mistakes column of an analysed game, the same in every list: none in green, else in red. */
export function MistakesCount({ count }: { count: number }) {
  return (
    <span className={cn('num text-base font-medium', count === 0 ? 'text-win' : 'text-loss')}>
      {formatNumber(count)}
    </span>
  )
}
