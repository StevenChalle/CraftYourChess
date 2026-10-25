/**
 * The player's own uses of Stockfish (an analysis, a deepening, a training's engine) and of the
 * platforms' game downloads. The background analysis gives way to them at once
 * (docs/background-analysis.md): it watches this tab through the listeners, and other tabs through
 * a shared Web Lock each activity holds, released by the browser if its tab closes. The deepening
 * started after an analysis, an activity itself, gives way to the others too (othersActive,
 * watchOthers, waitForOthers).
 */

const FOREGROUND_LOCK = 'craftyourchess:foreground'

let active = 0
const listeners = new Set<() => void>()

const lockManager = (): LockManager | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.locks

function notify() {
  for (const listener of listeners) listener()
}

/** Starts an activity of the player; call the returned function when it is over (once is enough). */
export function beginActivity(): () => void {
  active++
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  lockManager()
    ?.request(FOREGROUND_LOCK, { mode: 'shared' }, () => held)
    .catch(() => {})
  notify()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    active--
    release()
    notify()
  }
}

/** Runs `task` as an activity of the player. */
export async function withActivity<T>(task: () => Promise<T>): Promise<T> {
  const end = beginActivity()
  try {
    return await task()
  } finally {
    end()
  }
}

/** An activity of the player under way in this tab. */
export function isActiveHere(): boolean {
  return active > 0
}

/** An activity of the player under way in this tab or another one. */
export async function isPlayerActive(): Promise<boolean> {
  if (active > 0) return true
  try {
    const state = await lockManager()?.query()
    return state?.held?.some((lock) => lock.name === FOREGROUND_LOCK) ?? false
  } catch {
    return false
  }
}

/** Called whenever an activity starts or ends in this tab. */
export function onActivityChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** How often other tabs' activities are checked, and the quiet time before resuming */
const POLL_MS = 2000
const QUIET_MS = 3000

/**
 * Another activity than the caller's own `own` ones (a deepening holds one): in this tab, or in
 * another one, counting the shared locks held.
 */
export async function othersActive(own = 1): Promise<boolean> {
  if (active > own) return true
  try {
    const state = await lockManager()?.query()
    if (!state) return false
    return (state.held ?? []).filter((lock) => lock.name === FOREGROUND_LOCK).length > own
  } catch {
    return false
  }
}

/**
 * Calls `onActive` as soon as another activity starts (at once in this tab, within POLL_MS in
 * another one). Returns the function that stops watching.
 */
export function watchOthers(onActive: () => void, own = 1): () => void {
  const check = () => void othersActive(own).then((busy) => busy && onActive())
  const unlisten = onActivityChange(() => {
    if (active > own) onActive()
  })
  const timer = setInterval(check, POLL_MS)
  check()
  return () => {
    unlisten()
    clearInterval(timer)
  }
}

/** Resolves once no other activity has been seen for QUIET_MS, or when the signal aborts. */
export async function waitForOthers(signal: AbortSignal, own = 1): Promise<void> {
  let quiet = 0
  while (!signal.aborted && quiet < QUIET_MS) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_MS)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true },
      )
    })
    quiet = (await othersActive(own)) ? 0 : quiet + POLL_MS
  }
}
