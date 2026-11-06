/**
 * An evaluation's chip, everywhere in the app: white when it is positive (or equal), black when it
 * is negative, as the side it favours.
 */
export const WHITE_CHIP = 'border-piece-white bg-piece-white text-piece-black'
export const BLACK_CHIP = 'border-border-strong bg-piece-black text-piece-white'

/** The chip of an evaluation in centipawns, as shown (its sign decides). */
export function cpChip(cp: number): string {
  return cp < 0 ? BLACK_CHIP : WHITE_CHIP
}
