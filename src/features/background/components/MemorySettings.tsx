import { LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ConfirmOptions } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { formatGameCount, formatPositionCount } from '@/lib/format'
import { showToast } from '@/lib/toast'
import { m } from '@/paraglide/messages'
import { getFavorites } from '../favorites'
import { clearMemory, memoryStats } from '../memory'

/** While the settings are open: new analyses show in the counts. */
const REFRESH_MS = 3000

/**
 * What the browser keeps of the analyses, and a button to clear it but for the favorites'
 * synchronized games, which the background analysis keeps on its own (docs/analysis-cache.md).
 */
export function MemorySettings({
  confirm,
}: {
  /** From outside the popover, whose content would unmount the dialog when it takes the focus */
  confirm: (options: ConfirmOptions) => Promise<boolean>
}) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof memoryStats>>>()
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let current = true
    const refresh = () => void memoryStats().then((next) => current && setStats(next))
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [])

  const clear = async () => {
    const confirmed = await confirm({
      icon: Trash2,
      title: m.memory_clear_title(),
      description: m.memory_clear_body(),
      confirmLabel: m.memory_clear_action(),
      cancelLabel: m.confirm_cancel(),
    })
    if (!confirmed) return
    setClearing(true)
    const cleared = await clearMemory(getFavorites())
    setClearing(false)
    showToast(cleared ? m.toast_memory_cleared() : m.toast_memory_failed())
    setStats(await memoryStats())
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-text-strong">{m.memory_text()}</p>
      {stats && (
        <p className="num text-xs text-muted-foreground">
          {m.memory_stats({
            positions: formatPositionCount(stats.positions),
            games: formatGameCount(stats.games),
          })}
        </p>
      )}
      <Button variant="outline" size="sm" disabled={clearing} onClick={() => void clear()}>
        {clearing ? (
          <LoaderCircle data-icon="inline-start" className="animate-spin" />
        ) : (
          <Trash2 data-icon="inline-start" />
        )}
        {m.memory_clear()}
      </Button>
    </div>
  )
}
