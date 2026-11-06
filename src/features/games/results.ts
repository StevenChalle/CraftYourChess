import { m } from '@/paraglide/messages'
import type { GameResult } from './normalize'

/** A result's label (and its letter, where room is short) and color, from the player's side. */
export const RESULTS: Record<
  GameResult,
  { label: () => string; short: () => string; className: string }
> = {
  win: { label: m.result_win, short: m.result_win_short, className: 'text-win' },
  draw: { label: m.result_draw, short: m.result_draw_short, className: 'text-muted-foreground' },
  loss: { label: m.result_loss, short: m.result_loss_short, className: 'text-loss' },
}
