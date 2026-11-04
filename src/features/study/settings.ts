/** The review page's live engine, on or off: remembered in this browser (declared on /legal). */
const STORAGE_KEY = 'craftyourchess:study-engine'

export function loadEngineOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveEngineOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage refused (private browsing): only this visit remembers it.
  }
}
