import { defaultPoolSize } from '@/lib/engine/pool'
import { detectDevice, type DeviceKind } from '@/lib/device'
import { DEEP_NODES, QUICK_NODES, type WorkLeft } from './analyze'
import { deepCheckMinDrop, type ReviewCriteria } from './criteria'
import type { ReviewGame } from './games'

/**
 * Rough analysis time, before launching it. The positions are exact (the games are fetched);
 * the engine speed of a device is not, so it is shown as "≈". See docs/decisions.md.
 */

export type DeviceProfile = {
  /** Engines running in parallel (one per spare core, at most 4) */
  workers: number
  /** Nodes per second of one single-threaded WASM engine */
  nodesPerSecond: number
}

/**
 * Speed of one engine by kind of device.
 * desktop: measured on a 20-core PC (4 workers), about 198 M nodes in 60 s for 10 blitz games.
 * mobile: an assumption (about 3× slower per engine) until measured on a real phone.
 */
export const ENGINE_SPEED: Record<DeviceKind, number> = {
  desktop: 825_000,
  mobile: 250_000,
}

/** A typical computer: 4 engines (the pool's maximum) at desktop speed. */
export const REFERENCE_DESKTOP: DeviceProfile = { workers: 4, nodesPerSecond: ENGINE_SPEED.desktop }

/** This device: its kind sets the engine speed, its cores the engines the analysis will run. */
export function deviceProfile(kind: DeviceKind, workers = defaultPoolSize()): DeviceProfile {
  return { workers, nodesPerSecond: ENGINE_SPEED[kind] }
}

/**
 * Share of engine-evaluated positions that get a deep look, by deep-check threshold. About 10 %
 * measured at the default (6); lower thresholds flag many more moves. Rough, to be refined.
 */
export function deepShare(minDrop: number): number {
  if (minDrop >= 11) return 0.05
  if (minDrop >= 6) return 0.1
  if (minDrop >= 4) return 0.15
  if (minDrop >= 2) return 0.25
  return 0.35
}

/** Positions of a game the engine has to evaluate (Lichess's own analysis covers the others). */
export function enginePositions(
  game: Pick<ReviewGame, 'sanMoves' | 'serverCps' | 'initialFen'>,
): number {
  const positions = game.sanMoves.length + 1
  if (positions < 2) return 0
  if (!game.serverCps) return positions
  // Lichess evaluates the position after each move; the usual start position has a known value
  // (START_CP), a set-up one needs the engine.
  return (game.initialFen ? 1 : 0) + game.serverCps.filter((cp) => cp === undefined).length
}

/**
 * When the last job ends, each job being taken in order by the first engine free (as
 * EnginePool.run does): a few long games keep one engine busy while the others wait.
 */
export function makespan(durations: number[], workers: number): number {
  if (durations.length === 0) return 0
  const busyUntil = Array.from({ length: Math.min(workers, durations.length) }, () => 0)
  for (const duration of durations) {
    const first = busyUntil.indexOf(Math.min(...busyUntil))
    busyUntil[first]! += duration
  }
  return Math.max(...busyUntil)
}

/**
 * The quick pass on every game, then the deep pass, which starts once the quick one is over
 * (analyzeGames). Positions Lichess already evaluated are not counted (enginePositions).
 */
export function estimateSeconds(
  games: Pick<ReviewGame, 'sanMoves' | 'serverCps' | 'initialFen'>[],
  criteria: ReviewCriteria,
  device: DeviceProfile,
): number {
  const perGame = games.map(enginePositions).filter((positions) => positions > 0)
  return workSeconds({ quick: perGame, deep: [], fromCache: 0 }, criteria, device)
}

/**
 * The same from the work actually left (analysisWorkLeft): positions already in the analysis
 * cache cost nothing, and the deep pass of fully evaluated games is known exactly.
 */
export function workSeconds(
  work: WorkLeft,
  criteria: ReviewCriteria,
  device: DeviceProfile,
): number {
  const deepNodes = deepShare(deepCheckMinDrop(criteria)) * DEEP_NODES
  const seconds = (nodes: number) => nodes / device.nodesPerSecond
  return (
    makespan(
      work.quick.map((positions) => seconds(positions * QUICK_NODES)),
      device.workers,
    ) +
    makespan(
      [
        ...work.quick.map((positions) => seconds(positions * deepNodes)),
        ...work.deep.map((positions) => seconds(positions * DEEP_NODES)),
      ],
      device.workers,
    )
  )
}

/** How many times faster this work would be on a typical computer (see desktopSpeedup). */
export function workSpeedup(
  work: WorkLeft,
  criteria: ReviewCriteria,
  device: DeviceProfile,
): number | undefined {
  const desktop = workSeconds(work, criteria, REFERENCE_DESKTOP)
  if (desktop === 0) return undefined
  const ratio = workSeconds(work, criteria, device) / desktop
  return ratio >= 1.5 ? Math.round(ratio) : undefined
}

/**
 * How many times faster these games would be analysed on a typical computer, rounded; undefined
 * when the gain is too small to mention (under 1.5×).
 */
export function desktopSpeedup(
  games: Pick<ReviewGame, 'sanMoves' | 'serverCps' | 'initialFen'>[],
  criteria: ReviewCriteria,
  device: DeviceProfile,
): number | undefined {
  const here = estimateSeconds(games, criteria, device)
  const desktop = estimateSeconds(games, criteria, REFERENCE_DESKTOP)
  if (desktop === 0) return undefined
  const ratio = here / desktop
  return ratio >= 1.5 ? Math.round(ratio) : undefined
}

/** Rough time to deepen these positions on this device, several engines at once. */
export function deepenSeconds(positions: number): number {
  const engines = Math.max(1, Math.min(defaultPoolSize(), positions))
  return (positions * DEEP_NODES) / (ENGINE_SPEED[detectDevice()] * engines)
}
