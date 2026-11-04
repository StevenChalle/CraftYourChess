import type { Color } from 'chessops'
import { moveTime, type GameClock } from '@/features/review/games'

/** The move leading to position `index`: who played it, the time it took, the clock left after. */
export type TimeBar = { index: number; mover: Color; spent?: number; left: number }

/**
 * One bar per move of a timed game, from its clocks. `turns`: the side to move at each of the
 * game's positions (the mover of the move leading to position i is the one to move at i - 1).
 * Lichess's clocks start after each side's first move: no time spent for those.
 */
export function timeBars(clock: GameClock, turns: Color[], firstMovesTimed: boolean): TimeBar[] {
  const bars: TimeBar[] = []
  for (let index = 1; index < turns.length; index++) {
    const time = moveTime(clock, index - 1, firstMovesTimed)
    if (!time) break
    bars.push({ index, mover: turns[index - 1]!, spent: time.spent, left: time.left })
  }
  return bars
}

/**
 * A bar's share of the room (0 to 1), on a square-root scale: one long think does not crush the
 * moves played in a few seconds.
 */
export function barShare(spent: number, longest: number): number {
  return longest > 0 ? Math.sqrt(Math.max(spent, 0) / longest) : 0
}
