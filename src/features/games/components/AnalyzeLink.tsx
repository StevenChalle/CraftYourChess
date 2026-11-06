import { LoaderCircle, Microscope, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages'

/**
 * A game's action in a list. Not analysed: analyses it where it is (`onAnalyze`, a loader in the
 * button while `busy`). Analysed: opens the training of its errors (`onTrain`); `disabled` when it
 * has none, or while another game is analysed. `size` 'xs': its label hidden on a phone (an icon
 * alone), 'sm': larger, its label always shown. `compact`: the training named in full for screen
 * readers.
 */
export function AnalyzeLink({
  analysed = false,
  disabled = false,
  size = 'xs',
  compact = false,
  onAnalyze,
  onTrain,
  busy = false,
}: {
  analysed?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm'
  compact?: boolean
  onAnalyze?: () => void
  onTrain?: () => void
  busy?: boolean
}) {
  const label = size === 'xs' ? 'max-sm:sr-only' : undefined
  // In a list, the same width whatever the label, for the row's other buttons to line up.
  const width = size === 'xs' ? 'sm:min-w-22' : undefined
  if (analysed) {
    return (
      <Button
        size={size}
        className={width}
        disabled={disabled}
        onClick={onTrain}
        title={m.replay_game()}
        aria-label={compact ? m.replay_game() : undefined}
      >
        <Swords data-icon="inline-start" />
        <span className={label} aria-hidden={compact || undefined}>
          {m.replay_game_short()}
        </span>
      </Button>
    )
  }
  return (
    <Button
      size={size}
      className={width}
      // While busy, not greyed out: its loader says the analysis runs.
      onClick={busy ? undefined : onAnalyze}
      disabled={disabled}
      aria-busy={busy}
      title={m.history_analyze_title()}
    >
      {busy ? (
        <LoaderCircle data-icon="inline-start" className="animate-spin" />
      ) : (
        <Microscope data-icon="inline-start" />
      )}
      <span className={label}>{m.history_analyze()}</span>
    </Button>
  )
}
