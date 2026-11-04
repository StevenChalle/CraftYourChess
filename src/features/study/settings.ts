/**
 * The review page's live engine, on or off: off until switched on, the choice then remembered in
 * this browser (declared on /legal).
 */
const STORAGE_KEY = 'craftyourchess:study-engine'

export function loadEngineOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveEngineOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Storage refused (private browsing): only this visit remembers it.
  }
}
