import { useSyncExternalStore } from 'react'

/**
 * Installing the app (PWA). Chromium browsers (Chrome, Edge, Brave, Samsung Internet…) tell the
 * page when it can be installed (`beforeinstallprompt`): one click then opens their own install
 * dialog. Safari (iPhone, iPad, Mac) and Firefox on Android install it from their menus only: the
 * app shows how. Firefox on a computer cannot install it at all. Nothing is stored.
 */

/** The event Chromium browsers send (not in TypeScript's DOM types). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** How this browser installs the app, if it still can. */
export type InstallWay =
  /** Its own dialog, opened by the app */
  | 'prompt'
  /** Share, then Add to Home Screen */
  | 'ios'
  /** File, then Add to Dock */
  | 'mac-safari'
  /** The menu, then Install */
  | 'android-firefox'
  /** Installed already, or not possible here */
  | 'none'

type NavigatorLike = { userAgent: string; maxTouchPoints?: number; standalone?: boolean }

/** The way given by the browser alone, before any event (the prompt comes later, or never). */
export function installWayOf(nav: NavigatorLike, standalone: boolean): InstallWay {
  if (standalone || nav.standalone) return 'none'
  const ua = nav.userAgent
  // iPads report a Mac user agent: a Mac with a touch screen is an iPad.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)
  if (ios) return 'ios'
  if (/Android/.test(ua) && /Firefox/.test(ua)) return 'android-firefox'
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/.test(ua)) {
    return 'mac-safari'
  }
  return 'none'
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches)

let deferred: InstallPromptEvent | undefined
let way: InstallWay =
  typeof navigator === 'undefined' ? 'none' : installWayOf(navigator, isStandalone())
const listeners = new Set<() => void>()

function set(next: InstallWay) {
  way = next
  for (const listener of listeners) listener()
}

// Listened to from the start: the browser may send it before React renders.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // The app offers it with its own button rather than the browser's mini-infobar.
    event.preventDefault()
    deferred = event as InstallPromptEvent
    set('prompt')
  })
  window.addEventListener('appinstalled', () => {
    deferred = undefined
    set('none')
  })
}

export function useInstallWay(): InstallWay {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => way,
  )
}

/** Opens the browser's install dialog; true if the player accepted. Once only per event. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = undefined
  await event.prompt()
  const { outcome } = await event.userChoice
  // The event is spent either way. Declined: the browser sends a new one later, if it allows it.
  set('none')
  return outcome === 'accepted'
}
