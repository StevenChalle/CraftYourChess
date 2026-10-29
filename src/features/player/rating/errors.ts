import { RECIPE, reviewFromCache, type Mistake } from '@/features/review/analyze'
import { analysedGames, movesHash } from '@/features/review/cache'
import type { ReviewCriteria } from '@/features/review/criteria'
import type { ReviewGame } from '@/features/review/games'
import { mistakeThemes, type Theme } from '@/features/review/themes'

/**
 * The player's errors over the rating chart's period, from the games analysed before (the
 * analysis cache): nothing is analysed here. Where they happen (opening, middlegame, endgame) and
 * the themes that come back most, each with its errors, to train on them.
 */

export type GamePhase = 'opening' | 'middlegame' | 'endgame'
export const GAME_PHASES: GamePhase[] = ['opening', 'middlegame', 'endgame']

/** Themes worth naming as recurring; the phases are shown apart. */
const RECURRING_THEMES: Theme[] = [
  'advantage',
  'resilience',
  'findMate',
  'avoidMate',
  'timeTrouble',
  'pawnEndgame',
  'rookEndgame',
  'minorEndgame',
  'queenEndgame',
]
/** How many recurring themes to show */
const TOP_THEMES = 3

export type PeriodErrors = {
  /** Games of the period already analysed */
  analysed: number
  mistakes: Mistake[]
}

/** The errors of the period's games found analysed in the cache, judged with `criteria`. */
export async function periodErrors(
  games: ReviewGame[],
  criteria: ReviewCriteria,
): Promise<PeriodErrors> {
  const hashes = games.map((game) => movesHash(game.sanMoves, game.initialFen))
  const known = await analysedGames(hashes, RECIPE)
  const reviewed = await reviewFromCache(
    games.filter((_, index) => known.has(hashes[index]!)),
    criteria,
  )
  return { analysed: reviewed.length, mistakes: reviewed.flatMap((game) => game.mistakes) }
}

export type ErrorBreakdown = {
  phases: Record<GamePhase, Mistake[]>
  /** The most frequent themes, most frequent first */
  themes: { theme: Theme; mistakes: Mistake[] }[]
}

/** Each error in its phase (the opening as the training counts it), and the top themes. */
export function errorBreakdown(mistakes: Mistake[]): ErrorBreakdown {
  const phases: Record<GamePhase, Mistake[]> = { opening: [], middlegame: [], endgame: [] }
  const byTheme = new Map<Theme, Mistake[]>()
  for (const mistake of mistakes) {
    const themes = mistakeThemes(mistake)
    phases[
      themes.includes('opening') ? 'opening' : themes.includes('endgame') ? 'endgame' : 'middlegame'
    ].push(mistake)
    for (const theme of themes) {
      if (RECURRING_THEMES.includes(theme))
        byTheme.set(theme, [...(byTheme.get(theme) ?? []), mistake])
    }
  }
  const themes = [...byTheme.entries()]
    .map(([theme, list]) => ({ theme, mistakes: list }))
    .toSorted((a, b) => b.mistakes.length - a.mistakes.length)
    .slice(0, TOP_THEMES)
  return { phases, themes }
}
