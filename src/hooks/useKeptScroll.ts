import { useEffect, useRef, useState } from 'react'

/** What the player does to scroll: holding the scroll back in place stops then. */
const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

/**
 * Keeps a page's scroll for when the player comes back to it (from a review, a training): `save`
 * gets the window's scroll as the page is left; `saved`, once `ready` (the content is there again,
 * tall enough), puts it back, and holds it there a moment.
 */
export function useKeptScroll(
  saved: number | undefined,
  ready: boolean,
  save: (scrollY: number) => void,
) {
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    let scrollY = window.scrollY
    const onScroll = () => (scrollY = window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      saveRef.current(scrollY)
    }
  }, [])

  const [restore] = useState(saved)
  const restored = useRef(false)
  useEffect(() => {
    if (restore === undefined || restored.current || !ready) return
    restored.current = true
    // Held for half a second: the router sends a new page to the top just after it shows, and
    // the content may still be growing. The player scrolling meanwhile wins.
    let frames = 0
    let frame = 0
    const stop = () => {
      cancelAnimationFrame(frame)
      for (const type of USER_SCROLL) window.removeEventListener(type, stop)
    }
    for (const type of USER_SCROLL) window.addEventListener(type, stop, { passive: true })
    const step = () => {
      if (Math.abs(window.scrollY - restore) > 1) window.scrollTo(0, restore)
      if (++frames < 30) frame = requestAnimationFrame(step)
      else stop()
    }
    step()
  }, [restore, ready])
}
