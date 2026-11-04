import { useEffect, useState } from 'react'
import { detectDevice } from '@/lib/device'
import type { LiveAnalysis } from '@/lib/engine/stockfish'
import { LIVE_DEPTH, LiveEngine } from './liveEngine'

/** Moving through the moves quickly (a key held down) only searches where it stops. */
const SETTLE_MS = 120

/**
 * The live analysis of `fen` while `enabled` and the page is shown (LiveEngine): its latest
 * result, kept per position (coming back to one shows it at once). `failed` once the engine broke.
 */
export function useLiveAnalysis(
  fen: string | undefined,
  enabled: boolean,
): { analysis: LiveAnalysis | undefined; searching: boolean; failed: boolean } {
  const [latest, setLatest] = useState<{ fen: string; analysis: LiveAnalysis }>()
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [engine] = useState(
    () =>
      new LiveEngine({
        depth: LIVE_DEPTH[detectDevice()],
        onUpdate: (at, analysis) => setLatest({ fen: at, analysis }),
        onFailure: (error) => {
          console.error('Live analysis failed', error)
          setFailed(true)
        },
      }),
  )

  useEffect(() => () => engine.terminate(), [engine])

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const active = enabled && visible && !failed && fen !== undefined
  useEffect(() => {
    if (!active) {
      engine.stop()
      return
    }
    const timer = setTimeout(() => engine.analyse(fen), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [engine, active, fen])

  const analysis =
    fen === undefined ? undefined : latest?.fen === fen ? latest.analysis : engine.result(fen)
  return { analysis: enabled ? analysis : undefined, searching: active, failed }
}
