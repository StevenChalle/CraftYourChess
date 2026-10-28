import type { PlayerUsernames } from './search'

/** Profiles remembered by each store: the least recently changed go first */
const MAX_PROFILES = 50

/** A profile, whatever the case of its usernames: 'lichess:alice|chesscom:bob'. */
export function profileKey(usernames: PlayerUsernames): string {
  return (['lichess', 'chesscom'] as const)
    .filter((source) => usernames[source])
    .map((source) => `${source}:${usernames[source]!.toLowerCase()}`)
    .join('|')
}

type Saved = { version: number; profiles: Record<string, { value: unknown; savedAt: number }> }

/**
 * Settings kept per profile in one localStorage key (the 50 last changed), read back through
 * `parse`, which turns anything unknown, a missing profile included, into defaults. Another
 * `version` forgets what was saved.
 */
export function profileSettingsStore<T>(
  storageKey: string,
  version: number,
  parse: (value: unknown) => T,
) {
  const readAll = (): Saved['profiles'] => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Saved | null
      return parsed?.version === version && parsed.profiles ? parsed.profiles : {}
    } catch {
      // Storage unavailable or unreadable: defaults
      return {}
    }
  }
  return {
    load: (profile: string): T => parse(readAll()[profile]?.value),
    save: (profile: string, value: T, now = Date.now()) => {
      const kept = Object.entries({ ...readAll(), [profile]: { value, savedAt: now } })
        .sort(([, a], [, b]) => b.savedAt - a.savedAt)
        .slice(0, MAX_PROFILES)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ version, profiles: Object.fromEntries(kept) }),
        )
      } catch {
        // Not saved: the settings still apply until the page closes
      }
    },
  }
}
