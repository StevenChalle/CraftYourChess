/** How many games a list shows per page: the player's choice, remembered in this browser. */
const STORAGE_KEY = 'craftyourchess:games-page-size'

export const PAGE_SIZES = [10, 20, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20

export function loadPageSize(storage: Storage = localStorage): number {
  try {
    const saved = Number(storage.getItem(STORAGE_KEY))
    return (PAGE_SIZES as readonly number[]).includes(saved) ? saved : DEFAULT_PAGE_SIZE
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

export function savePageSize(size: number, storage: Storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, String(size))
  } catch {
    // Storage refused (private browsing): only this visit remembers it.
  }
}
