import { useLayoutEffect, useState, type RefObject } from 'react'

/** Side panel next to the board (w-80) and the gap between them (gap-6), in px. */
const PANEL_WIDTH = 320
const GAP = 24
/** Space kept under the board. */
const BOTTOM_MARGIN = 24
/** Never smaller than this, even on a short window (the page then scrolls)… */
const MIN_SIZE = 320
/** …nor larger than this: past it, a bigger board only gets in the way. */
const MAX_SIZE = 720
/** From this width on, the board sits next to the panel (Tailwind's md). */
export const SIDE_BY_SIDE = '(min-width: 768px)'

/**
 * The largest board that fits next to the panel: the whole height left under the board's top (as
 * the page is when scrolled to the top), within the page's column (aligned with the header), up to
 * MAX_SIZE. undefined on narrow screens, where the board takes the full width above the panel.
 * `beside`: what sits next to the board on its row (the panel and the gaps), when not the
 * training's.
 */
export function useBoardSize(
  ref: RefObject<HTMLElement | null>,
  beside = GAP + PANEL_WIDTH,
): number | undefined {
  const [size, setSize] = useState<number>()
  useLayoutEffect(() => {
    const element = ref.current
    const column = element?.parentElement
    if (!element || !column) return
    const sideBySide = window.matchMedia(SIDE_BY_SIDE)
    const update = () => {
      if (!sideBySide.matches) return setSize(undefined)
      // Hidden (another tab is shown): nothing to measure until it is shown again.
      if (element.offsetParent === null) return
      const top = element.getBoundingClientRect().top + window.scrollY
      const byHeight = window.innerHeight - top - BOTTOM_MARGIN
      const byWidth = column.clientWidth - beside
      setSize(Math.floor(Math.max(MIN_SIZE, Math.min(byHeight, byWidth, MAX_SIZE))))
    }
    update()
    // Shown again after another tab, the column resized, or content above changing height.
    const observer = new ResizeObserver(update)
    observer.observe(element)
    observer.observe(column)
    observer.observe(document.body)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref, beside])
  return size
}
