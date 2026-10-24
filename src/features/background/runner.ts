import { movesHash } from '@/features/review/cache'
import type { ReviewCriteria } from '@/features/review/criteria'
import type { FoundGames, ReviewAccount } from '@/features/review/fetch'
import type { ReviewGame } from '@/features/review/games'
import { defaultSelection, type GameSelection } from '@/features/review/selection'
import { ApiError } from '@/lib/http'
import { playerAccounts, playerName, type Favorites } from './favorites'

/**
 * Keeps the favorite players' latest games fetched and analysed while the app is open, on any page
 * (docs/background-analysis.md). Gives way at once to the player's own uses of Stockfish and of
 * the platforms (lib/activity.ts): it aborts what it does, then starts again a few seconds after
 * the last one. Nothing is lost: evaluations are in the analysis cache, games in the game store.
 */

export type BackgroundPhase =
  | 'starting'
  /** Another tab does the work */
  | 'elsewhere'
  | 'syncing'
  | 'analysing'
  /** Every position at depth, once all the games are analysed (the deep option) */
  | 'deepening'
  | 'up-to-date'
  /** The player uses Stockfish or the platforms */
  | 'busy'
  /** Paused by the player, for this session */
  | 'paused'
  | 'rate-limited'
  | 'failed'

export type BackgroundState = {
  phase: BackgroundPhase
  /** Games analysed, out of `total` */
  done?: number
  total?: number
  /** How far the batch under way is, in games (a fraction of its size): moves the bar between batches */
  current?: number
  /** How far each favorite is, once a pass has started */
  players?: PlayerProgress[]
}

/** What the runner works with: injected, so that tests need neither engines nor network. */
export type BackgroundDeps = {
  find: (
    accounts: ReviewAccount[],
    selection: GameSelection,
    signal: AbortSignal,
  ) => Promise<FoundGames>
  /** The games (movesHash) already analysed with the current recipe */
  analysed: (games: ReviewGame[]) => Promise<Set<string>>
  /** `onProgress`: the share of the work done on these games, 0 to 1 */
  analyze: (
    games: ReviewGame[],
    criteria: ReviewCriteria,
    signal: AbortSignal,
    onProgress: (share: number) => void,
  ) => Promise<void>
  /** The player's saved criteria: the deep pass depends on them */
  criteria: () => ReviewCriteria
  /** The games (movesHash) with positions not evaluated deeply yet */
  toDeepen: (games: ReviewGame[]) => Promise<Set<string>>
  /** Evaluates deeply every position of these games that is not yet */
  deepen: (
    games: ReviewGame[],
    signal: AbortSignal,
    onProgress: (share: number) => void,
  ) => Promise<void>
  /** An activity of the player, in this tab or another one */
  isPlayerActive: () => Promise<boolean>
  isActiveHere: () => boolean
  onActivityChange: (listener: () => void) => () => void
  /** Resolves after `ms`, or as soon as the signal aborts */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>
  /** The Web Locks manager, to let a single tab work; none: this tab works */
  locks?: LockManager
  /** Messages between the app's tabs: the working tab's heartbeat */
  channel?: TabChannel
  /** The page is shown */
  isVisible: () => boolean
  now: () => number
}

/** The working tab says it is alive, whether it is shown, and how far it is (for the others to show). */
export type Heartbeat = {
  visible: boolean
  done?: number
  total?: number
  players?: PlayerProgress[]
}

export type TabChannel = {
  post: (heartbeat: Heartbeat) => void
  /** Heartbeats of the other tabs */
  listen: (listener: (heartbeat: Heartbeat) => void) => () => void
}

/** Games analysed in one go: small, so that the progress moves and an abort wastes little. */
export const BATCH = 5
/** Games deepened in one go: every position at depth takes a while. */
export const DEEP_BATCH = 2
/** Quiet time after the player's last activity before starting again */
export const IDLE_MS = 3000
/** How often another tab's activities are checked */
export const POLL_MS = 2000
/** Up to date: looking for new games this often (and whenever the page shows again) */
export const RECHECK_MS = 10 * 60_000
/** After a 429 or a failure */
export const RETRY_MS = 60_000
/** How often the working tab says it is alive */
export const HEARTBEAT_MS = 5000
/**
 * A working tab silent this long is stuck (a browser freezes a hidden tab that uses the CPU, and
 * it keeps its lock): a shown tab takes the work back.
 */
export const STALE_MS = 15_000

const LOCK = 'craftyourchess:background'

const gameKey = (game: ReviewGame) => movesHash(game.sanMoves, game.initialFen)

/**
 * How far one favorite is: their games fetched (loading until then), and the share of the work
 * done on them, analysis then deepening with the deep option.
 */
export type PlayerProgress = {
  /** As named in the settings (playerName) */
  name: string
  /** Their latest games followed: the option */
  max: number
  /** 0 to 1 */
  share: number
  /** Their games are being fetched, or will be in this pass */
  loading: boolean
}

/**
 * One pass: fetch each favorite's latest games, as many as their options say (the game store only
 * asks for new ones), then analyse those not analysed yet, newest first, a few at a time; then,
 * only once every game is analysed a first time, evaluate every position at depth of the games of
 * the favorites with the deep option, newest first again. A favorite's games not all fetched
 * (rate limit, network): no deepening in this pass, the next one fetches and analyses them first. Rejects as soon as the signal aborts. Each report says how far each favorite is,
 * starting from `previous` (the last pass) until their games are fetched again.
 */
export async function runCycle(
  favorites: Favorites,
  deps: BackgroundDeps,
  signal: AbortSignal,
  report: (state: BackgroundState) => void,
  previous: PlayerProgress[] = [],
): Promise<{ rateLimited: boolean }> {
  const { players } = favorites
  const names = players.map(playerName)
  const shares = names.map((name) => previous.find((item) => item.name === name)?.share ?? 0)
  const loading = players.map(() => true)
  /** Each favorite's games (gameKey) */
  const keysOf: string[][] = players.map(() => [])
  const send = (state: BackgroundState) =>
    report({
      ...state,
      players: players.map((player, index) => ({
        name: names[index]!,
        max: player.depth,
        share: shares[index]!,
        loading: loading[index]!,
      })),
    })

  send({ phase: 'syncing' })
  // Each favorite's latest games, one player after the other, all together then: once each,
  // a game between two favorites being theirs both (deepened if one of them wants it).
  const byKey = new Map<string, ReviewGame>()
  const deepKeys = new Set<string>()
  let rateLimited = false
  let incomplete = false
  for (const [index, player] of players.entries()) {
    const accounts = playerAccounts(player)
    const selection: GameSelection = {
      ...defaultSelection(accounts.map((account) => account.source)),
      scope: { kind: 'latest', count: player.depth },
    }
    const found = await deps.find(accounts, selection, signal)
    signal.throwIfAborted()
    rateLimited ||= found.failures.some(
      ({ error }) => error instanceof ApiError && error.status === 429,
    )
    incomplete ||= found.failures.length > 0
    for (const game of found.games) {
      byKey.set(`${game.source}:${game.id}`, game)
      if (player.deep) deepKeys.add(`${game.source}:${game.id}`)
    }
    // A game without moves has nothing to analyse.
    keysOf[index] = found.games.filter((game) => game.sanMoves.length > 0).map(gameKey)
    loading[index] = false
    send({ phase: 'syncing' })
  }
  const total = byKey.size
  const games = [...byKey.values()].filter((game) => game.sanMoves.length > 0)
  const deepGames = games.filter((game) => deepKeys.has(`${game.source}:${game.id}`))
  const analysed = await deps.analysed(games)
  // Analysing does not deepen: known before, so each favorite's share is right from the start.
  const shallow = deepGames.length > 0 ? await deps.toDeepen(deepGames) : new Set<string>()
  const deepened = new Set(deepGames.map(gameKey).filter((key) => !shallow.has(key)))
  const updateShares = () => {
    for (const [index, player] of players.entries()) {
      const keys = keysOf[index]!
      const count = (set: Set<string>) => keys.filter((key) => set.has(key)).length
      shares[index] =
        keys.length === 0
          ? 1
          : player.deep
            ? (count(analysed) + count(deepened)) / (2 * keys.length)
            : count(analysed) / keys.length
    }
  }
  updateShares()

  const pending = games.filter((game) => !analysed.has(gameKey(game)))
  let done = total - pending.length
  send({ phase: 'analysing', done, total })
  for (let index = 0; index < pending.length; index += BATCH) {
    signal.throwIfAborted()
    const batch = pending.slice(index, index + BATCH)
    await deps.analyze(batch, deps.criteria(), signal, (share) =>
      send({ phase: 'analysing', done, total, current: share * batch.length }),
    )
    done += batch.length
    for (const game of batch) analysed.add(gameKey(game))
    updateShares()
    send({ phase: 'analysing', done, total })
  }

  if (deepGames.length > 0 && !incomplete) {
    const toDeepen = deepGames.filter((game) => shallow.has(gameKey(game)))
    // Out of the games to deepen only: the others never will be.
    const deepTotal = deepGames.length
    let deepDone = deepTotal - toDeepen.length
    send({ phase: 'deepening', done: deepDone, total: deepTotal })
    for (let index = 0; index < toDeepen.length; index += DEEP_BATCH) {
      signal.throwIfAborted()
      const batch = toDeepen.slice(index, index + DEEP_BATCH)
      await deps.deepen(batch, signal, (share) =>
        send({
          phase: 'deepening',
          done: deepDone,
          total: deepTotal,
          current: share * batch.length,
        }),
      )
      deepDone += batch.length
      for (const game of batch) deepened.add(gameKey(game))
      updateShares()
      send({ phase: 'deepening', done: deepDone, total: deepTotal })
    }
  }
  return { rateLimited }
}

/** The same progress for every favorite (a new report of it is not news for the other tabs). */
function samePlayers(a: PlayerProgress[] = [], b: PlayerProgress[] = []): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]
      return (
        other !== undefined &&
        item.name === other.name &&
        item.max === other.max &&
        item.share === other.share &&
        item.loading === other.loading
      )
    })
  )
}

export class BackgroundRunner {
  private state: BackgroundState = { phase: 'starting' }
  private readonly listeners = new Set<() => void>()
  private paused = false
  /** Ends the current wait early */
  private wake: (() => void) | undefined
  /** The pass under way, aborted when the player needs the engines or pauses */
  private current: AbortController | undefined
  private stopper: AbortController | undefined
  /** This tab holds the lock and works */
  private working = false
  private readonly favorites: Favorites
  private readonly deps: BackgroundDeps

  constructor(favorites: Favorites, deps: BackgroundDeps) {
    this.favorites = favorites
    this.deps = deps
  }

  getState = (): BackgroundState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Runs until stop(), in a single tab at a time when Web Locks exist: the tab holding the lock
   * works, the others wait for it, unless the working tab is hidden or silent and this one is
   * shown (it takes the lock back).
   */
  start(): void {
    const stop = new AbortController()
    this.stopper = stop
    const { locks } = this.deps
    if (locks) this.waitForLock(locks, stop.signal)
    else void this.loop(stop.signal)
  }

  private waitForLock(locks: LockManager, stop: AbortSignal): void {
    if (stop.aborted) return
    const { done, total, players } = this.state
    this.set({ done, total, players, phase: 'elsewhere' })
    const waiting = new AbortController()
    const since = this.deps.now()
    let heard: (Heartbeat & { at: number }) | undefined
    const unlisten = this.deps.channel?.listen((heartbeat) => {
      heard = { ...heartbeat, at: this.deps.now() }
      // The working tab's progress, shown here too.
      if (heartbeat.total !== undefined || heartbeat.players) {
        const { done, total, players } = heartbeat
        this.set({ phase: 'elsewhere', done, total, players })
      }
    })
    const check = setInterval(() => {
      if (!this.deps.isVisible()) return
      const silent = this.deps.now() - (heard?.at ?? since) > STALE_MS
      if (silent || heard?.visible === false) {
        waiting.abort()
        this.takeLock(locks, stop, { steal: true })
      }
    }, POLL_MS)
    const cleanup = () => {
      clearInterval(check)
      unlisten?.()
      stop.removeEventListener('abort', cleanup)
      waiting.abort()
    }
    stop.addEventListener('abort', cleanup, { once: true })
    waiting.signal.addEventListener('abort', cleanup, { once: true })
    // Granted: no more watching (this tab does not hear its own heartbeat).
    this.takeLock(locks, stop, { signal: waiting.signal }, cleanup)
  }

  /**
   * Asks for the lock, then works while holding it. If another tab takes it back, the request
   * rejects: this tab stops working, and waits again.
   */
  private takeLock(
    locks: LockManager,
    stop: AbortSignal,
    options: LockOptions,
    onGranted?: () => void,
  ): void {
    const holding = new AbortController()
    locks
      .request(LOCK, options, async () => {
        // Given up on (stopped, or the lock taken another way): an abort right after the request
        // can reach the browser too late to cancel it, so it may still be granted. Release it.
        if (stop.aborted || options.signal?.aborted || this.working) return
        onGranted?.()
        await this.work(stop, holding.signal)
        if (!stop.aborted && holding.signal.aborted) this.waitForLock(locks, stop)
      })
      .catch(() => holding.abort())
  }

  /** The loop, with a heartbeat for the waiting tabs. */
  private async work(stop: AbortSignal, holding: AbortSignal): Promise<void> {
    this.working = true
    this.beat()
    const heartbeat = setInterval(() => this.beat(), HEARTBEAT_MS)
    try {
      await this.loop(AbortSignal.any([stop, holding]))
    } finally {
      clearInterval(heartbeat)
      this.working = false
    }
  }

  private beat(): void {
    const { done, total, players } = this.state
    this.deps.channel?.post({ visible: this.deps.isVisible(), done, total, players })
  }

  stop(): void {
    this.stopper?.abort()
    this.current?.abort()
    this.wake?.()
  }

  pause(): void {
    this.paused = true
    this.current?.abort()
    this.set({ ...this.state, phase: 'paused' })
    this.wake?.()
  }

  resume(): void {
    this.paused = false
    this.wake?.()
  }

  /** Looks for new games now (the page shows again). */
  wakeUp(): void {
    if (this.state.phase === 'up-to-date' || this.state.phase === 'failed') this.wake?.()
  }

  private set(state: BackgroundState) {
    const progressed =
      state.done !== this.state.done ||
      state.total !== this.state.total ||
      !samePlayers(state.players, this.state.players)
    this.state = state
    for (const listener of this.listeners) listener()
    // The waiting tabs follow the progress without waiting for the next heartbeat.
    if (this.working && progressed) this.beat()
  }

  /** Sleeps `ms` (forever if undefined), or until woken or stopped. */
  private async wait(stop: AbortSignal, ms?: number): Promise<void> {
    const woken = new AbortController()
    const onStop = () => woken.abort()
    stop.addEventListener('abort', onStop, { once: true })
    this.wake = () => woken.abort()
    try {
      if (ms === undefined) {
        await new Promise<void>((resolve) =>
          woken.signal.addEventListener('abort', () => resolve(), { once: true }),
        )
      } else {
        await this.deps.sleep(ms, woken.signal)
      }
    } finally {
      stop.removeEventListener('abort', onStop)
      this.wake = undefined
    }
  }

  /** Waits until the player has been inactive for IDLE_MS, here and in other tabs. */
  private async waitIdle(stop: AbortSignal): Promise<void> {
    let quiet = 0
    while (!stop.aborted && !this.paused && quiet < IDLE_MS) {
      await this.wait(stop, POLL_MS)
      quiet = (await this.deps.isPlayerActive()) ? 0 : quiet + POLL_MS
    }
  }

  private async loop(stop: AbortSignal): Promise<void> {
    const progress = () => ({
      done: this.state.done,
      total: this.state.total,
      players: this.state.players,
    })
    while (!stop.aborted) {
      if (this.paused) {
        this.set({ ...progress(), phase: 'paused' })
        await this.wait(stop)
        continue
      }
      if (await this.deps.isPlayerActive()) {
        this.set({ ...progress(), phase: 'busy' })
        await this.waitIdle(stop)
        continue
      }

      const run = new AbortController()
      this.current = run
      const abort = () => run.abort()
      stop.addEventListener('abort', abort, { once: true })
      const unsubscribe = this.deps.onActivityChange(() => {
        if (this.deps.isActiveHere()) run.abort()
      })
      // Other tabs' activities are only seen by asking.
      const poll = setInterval(() => {
        void this.deps.isPlayerActive().then((active) => active && run.abort())
      }, POLL_MS)
      let next: { phase: BackgroundPhase; ms: number }
      try {
        const { rateLimited } = await runCycle(
          this.favorites,
          this.deps,
          run.signal,
          (state) => this.set(state),
          this.state.players,
        )
        next = rateLimited
          ? { phase: 'rate-limited', ms: RETRY_MS }
          : { phase: 'up-to-date', ms: RECHECK_MS }
      } catch (error) {
        // The player needs the engines, paused, or the runner stops: the loop sees which.
        if (run.signal.aborted) continue
        console.warn('Background analysis failed', error)
        next = { phase: 'failed', ms: RETRY_MS }
      } finally {
        clearInterval(poll)
        unsubscribe()
        stop.removeEventListener('abort', abort)
        this.current = undefined
      }
      this.set({ ...progress(), phase: next.phase })
      await this.wait(stop, next.ms)
    }
  }
}
