import { useEffect, useRef, useState } from 'react'

/**
 * Keeps a page's scroll for when the player comes back to it (from a review, a training): `save`
 * gets the window's scroll as the page is left; `saved`, once `ready` (the content is there again,
 * tall enough), puts it back. The content may still be growing (a panel sliding open): it tries
 * again for a moment until the page is tall enough.
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
    let frames = 0
    const step = () => {
      window.scrollTo(0, restore)
      if (Math.abs(window.scrollY - restore) > 1 && ++frames < 60) requestAnimationFrame(step)
    }
    step()
  }, [restore, ready])
}
