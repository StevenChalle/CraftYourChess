import { m } from '@/paraglide/messages'
import type { GameResult } from './normalize'

/** A result's label and color, from the player's side. */
export const RESULTS: Record<GameResult, { label: () => string; className: string }> = {
  win: { label: m.result_win, className: 'text-win' },
  draw: { label: m.result_draw, className: 'text-muted-foreground' },
  loss: { label: m.result_loss, className: 'text-loss' },
}
