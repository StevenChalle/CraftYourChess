import { Chessground } from '@lichess-org/chessground'
import type { Api } from '@lichess-org/chessground/api'
import type { Config } from '@lichess-org/chessground/config'
import '@lichess-org/chessground/assets/chessground.base.css'
import '@lichess-org/chessground/assets/chessground.brown.css'
import '@lichess-org/chessground/assets/chessground.cburnett.css'
import { useBoardStyle } from './boardStyle'
import './boardStyles.css'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type BoardProps = {
  config?: Config
  className?: string
}

/**
 * Thin React wrapper around chessground (the Lichess board).
 * Chessground owns its DOM: we create it once, then push config updates with api.set().
 */
export function Board({ config, className }: BoardProps) {
  const style = useBoardStyle()
  const elementRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<Api | null>(null)

  useEffect(() => {
    if (!elementRef.current) return
    const element = elementRef.current
    const api = Chessground(element, config)
    apiRef.current = api
    // Chessground caches the board's size. Created while hidden (a tab not shown yet) it would
    // measure 0×0 and miss every click: redraw whenever the size changes, shown again included.
    const observer = new ResizeObserver(() => api.redrawAll())
    observer.observe(element)
    return () => {
      observer.disconnect()
      api.destroy()
      apiRef.current = null
    }
    // Created once on mount; later config changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fenRef = useRef(config?.fen)
  useEffect(() => {
    const api = apiRef.current
    if (!config || !api) return
    api.set(config)
    // A new position: drop any piece still selected in the previous one (and its stale dests),
    // and the arrows drawn on the previous one.
    if (config.fen !== fenRef.current) {
      api.cancelMove()
      api.setShapes([])
    }
    fenRef.current = config.fen
  }, [config])

  return (
    <div
      className={cn(
        'aspect-square w-full',
        // Brown and cburnett are chessground's own; the others are in boardStyles.css.
        style.board !== 'brown' && `board-custom board-${style.board}`,
        style.pieces !== 'cburnett' && `pieces-${style.pieces}`,
        className,
      )}
      // Chessground also caches where the board is on screen, and only refreshes it on window
      // resize or scroll. A layout shift (content above appearing or going away) would make clicks
      // land on the wrong squares: forget the cached position before each press.
      onPointerDownCapture={() => apiRef.current?.state.dom.bounds.clear()}
    >
      <div ref={elementRef} className="size-full" />
    </div>
  )
}
