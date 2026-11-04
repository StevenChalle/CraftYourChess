import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatNumber } from '@/lib/format'
import { m } from '@/paraglide/messages'

/**
 * "21–40 of 142" with previous / next buttons, and the choice of how many per page when
 * `onPageSizeChange` is given. Hidden when everything fits on one page (and on the smallest one).
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizes,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  pageSizes?: readonly number[]
  onPageSizeChange?: (size: number) => void
}) {
  const pages = Math.ceil(total / pageSize)
  const choosing = pageSizes !== undefined && onPageSizeChange !== undefined
  if (pages <= 1 && !(choosing && total > Math.min(...pageSizes))) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-end gap-2">
      {choosing && (
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
          <SelectTrigger
            size="sm"
            aria-label={m.pagination_page_size_label()}
            className="mr-auto text-muted-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {m.pagination_page_size({ count: formatNumber(size) })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <span className="text-sm text-muted-foreground tabular-nums">
        {m.pagination_range({
          from: formatNumber(from),
          to: formatNumber(to),
          total: formatNumber(total),
        })}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        aria-label={m.pagination_previous()}
        title={m.pagination_previous()}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={page >= pages - 1}
        onClick={() => onPageChange(page + 1)}
        aria-label={m.pagination_next()}
        title={m.pagination_next()}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
