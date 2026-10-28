import { Link, useLocation } from '@tanstack/react-router'
import { History, LayoutGrid, List, Microscope, SlidersHorizontal, Swords, X } from 'lucide-react'
import { useEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import { useAnalysisSession } from '@/features/review/sessionContext'
import { trainingTitle } from '@/features/training/title'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages'
import type { ProfileSearch } from '../search'

// TanStack Router sets data-status="active" on the current link.
// Icons stay discreet: small and dimmed, in the tab's color.
const TAB_CLASS =
  'tab-etabli inline-flex shrink-0 items-center gap-2 px-1 pb-2.5 whitespace-nowrap transition-colors [&>svg]:size-3.5 [&>svg]:opacity-70'

/**
 * The profile's tabs: overview, games, the analysis filters, then its results once there is an
 * analysis, and a closable tab per training. Switching tabs keeps the scroll position
 * (`resetScroll={false}`): a training tab places its board itself. The bar scrolls sideways when
 * the tabs overflow (several trainings on a phone): the underline sits on the bar's border instead
 * of overlapping it, which a scroller would clip.
 */
export function PlayerTabs({
  usernames,
  canAnalyse,
}: {
  usernames: ProfileSearch
  /** Some account has games to analyse (closed ones do not) */
  canAnalyse: boolean
}) {
  const { analysis, analysisId, trainings, closeTraining } = useAnalysisSession()
  const navRef = useRef<HTMLElement>(null)
  const pathname = useLocation({ select: (location) => location.pathname })
  // However a tab gets opened (its link, the profile name, a button), scroll the bar so it shows.
  // Found by its path: the router marks the active link a little later. One frame later too: the
  // router's own scrolling (back to the top of the page) would cancel a smooth scroll started now.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const nav = navRef.current
      const tab = nav?.querySelector<HTMLElement>(`[data-path="${pathname}"]`)
      if (!nav || !tab) return
      const bar = nav.getBoundingClientRect()
      const box = tab.getBoundingClientRect()
      const margin = 24
      const left =
        box.left < bar.left
          ? nav.scrollLeft - (bar.left - box.left) - margin
          : box.right > bar.right
            ? nav.scrollLeft + (box.right - bar.right) + margin
            : undefined
      if (left !== undefined) nav.scrollTo({ left, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname, trainings.length])

  // With a mouse, the hidden tabs are reached with the wheel (only while the bar overflows) or by
  // dragging the bar; touch screens swipe it natively. A drag never counts as a click.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const onWheel = (event: WheelEvent) => {
      if (nav.scrollWidth <= nav.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return
      event.preventDefault()
      nav.scrollLeft += event.deltaY
    }
    nav.addEventListener('wheel', onWheel, { passive: false })
    return () => nav.removeEventListener('wheel', onWheel)
  }, [])
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | undefined>(undefined)
  const dragHandlers = {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false }
    },
    onPointerMove: (event: PointerEvent) => {
      const current = drag.current
      if (!current) return
      const dx = event.clientX - current.x
      if (!current.moved) {
        if (Math.abs(dx) < 5) return
        // From now on the bar follows the mouse, even outside it.
        current.moved = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      event.currentTarget.scrollLeft = current.scroll - dx
    },
    onPointerUp: () => {
      // After a drag, kept for the click that follows (which it cancels), then dropped.
      if (drag.current?.moved) setTimeout(() => (drag.current = undefined))
      else drag.current = undefined
    },
    onClickCapture: (event: MouseEvent) => {
      if (drag.current?.moved) {
        event.preventDefault()
        event.stopPropagation()
      }
      drag.current = undefined
    },
    // Links are draggable by default: the browser would drag the link instead of the bar.
    onDragStart: (event: DragEvent) => event.preventDefault(),
  }
  return (
    <nav
      ref={navRef}
      {...dragHandlers}
      className="flex [scrollbar-width:none] gap-6 overflow-x-auto border-b"
      aria-label={m.tabs_label()}
    >
      {/* Imported games have no profile to show */}
      {!usernames.import && (
        <Link
          resetScroll={false}
          to="/player"
          data-path="/player"
          search={usernames}
          activeOptions={{ exact: true }}
          className={TAB_CLASS}
        >
          <LayoutGrid aria-hidden />
          {m.tab_overview()}
        </Link>
      )}
      <Link
        resetScroll={false}
        to="/player/history"
        data-path="/player/history"
        search={usernames}
        className={TAB_CLASS}
      >
        <List aria-hidden />
        {m.tab_history()}
      </Link>
      {canAnalyse && (
        <Link
          resetScroll={false}
          to="/player/analysis"
          data-path="/player/analysis"
          search={usernames}
          className={TAB_CLASS}
        >
          <SlidersHorizontal aria-hidden />
          {m.tab_analysis()}
        </Link>
      )}
      {analysis.status !== 'none' && (
        <Link
          resetScroll={false}
          to="/player/results"
          data-path="/player/results"
          search={usernames}
          className={TAB_CLASS}
        >
          <Microscope aria-hidden />
          {m.tab_results()}
        </Link>
      )}
      {trainings.map((tab) => {
        const title = trainingTitle(tab, trainings)
        // Its errors come from an analysis replaced since: dimmed, with a clock.
        const stale = tab.analysisId !== analysisId
        return (
          <span key={tab.number} className={cn('flex shrink-0 items-start', stale && 'opacity-60')}>
            <Link
              resetScroll={false}
              to="/player/training/$number"
              data-path={`/player/training/${tab.number}`}
              params={{ number: String(tab.number) }}
              search={usernames}
              title={stale ? m.training_stale() : undefined}
              className={TAB_CLASS}
            >
              {stale ? <History aria-hidden /> : <Swords aria-hidden />}
              {title}
            </Link>
            <button
              type="button"
              onClick={() => void closeTraining(tab.number)}
              aria-label={m.training_close({ title })}
              className="ml-0.5 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-text-strong"
            >
              <X className="size-3.5" />
            </button>
          </span>
        )
      })}
    </nav>
  )
}
