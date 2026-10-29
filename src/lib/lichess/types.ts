/** Subset of Lichess API payloads we use. Extend as needed: https://lichess.org/api */

export type PerfKey =
  | 'ultraBullet'
  | 'bullet'
  | 'blitz'
  | 'rapid'
  | 'classical'
  | 'correspondence'
  | 'chess960'
  | 'crazyhouse'
  | 'antichess'
  | 'atomic'
  | 'horde'
  | 'kingOfTheHill'
  | 'racingKings'
  | 'threeCheck'
  | 'puzzle'
  | 'storm'
  | 'racer'
  | 'streak'

export type Perf = {
  games?: number
  rating?: number
  rd?: number
  prog?: number
  prov?: boolean
  /** Puzzle storm / racer / streak use runs + score instead of rating */
  runs?: number
  score?: number
}

/** One entry per ply of an analysed game: the evaluation after that move, from White's side. */
export type LichessMoveAnalysis = {
  /** Centipawns */
  eval?: number
  /** Moves to mate, positive when White mates */
  mate?: number
  /** Best move (UCI), only on inaccuracies, mistakes and blunders */
  best?: string
  variation?: string
  judgment?: { name: 'Inaccuracy' | 'Mistake' | 'Blunder'; comment: string }
}

export type LichessGamePlayer = {
  user?: { id: string; name: string; title?: string }
  /** Before the game */
  rating?: number
  /** Rating won or lost in this game (rated games) */
  ratingDiff?: number
  /** Stockfish level when playing the computer */
  aiLevel?: number
  /** Only when the game was analysed */
  analysis?: {
    inaccuracy: number
    mistake: number
    blunder: number
    acpl: number
    accuracy?: number
  }
}

/** A game from the export API (`/api/games/user/{username}`, NDJSON). */
export type LichessGame = {
  id: string
  rated: boolean
  /** standard, chess960, fromPosition, crazyhouse... */
  variant: string
  /** ultraBullet, bullet, blitz, rapid, classical, correspondence */
  speed: string
  perf: string
  /** Unix milliseconds */
  createdAt: number
  /** Unix milliseconds */
  lastMoveAt: number
  /** mate, resign, outoftime, draw, stalemate, aborted, noStart... */
  status: string
  players: { white: LichessGamePlayer; black: LichessGamePlayer }
  /** Absent for draws */
  winner?: 'white' | 'black'
  /** SAN moves separated by spaces */
  moves: string
  initialFen?: string
  /** Seconds */
  clock?: { initial: number; increment: number; totalTime: number }
  daysPerTurn?: number
  /** Only for games analysed by the Lichess servers, with `evals=true` */
  analysis?: LichessMoveAnalysis[]
  /** With `clocks=true`: the mover's clock after each move (centiseconds), for timed games */
  clocks?: number[]
}

export type LichessUser = {
  id: string
  username: string
  title?: string
  patron?: boolean
  /** Closed account */
  disabled?: boolean
  /** Account marked for terms of service violation */
  tosViolation?: boolean
  createdAt?: number
  seenAt?: number
  perfs?: Partial<Record<PerfKey, Perf>>
  count?: {
    all: number
    rated: number
    ai?: number
    win: number
    loss: number
    draw: number
    import?: number
  }
  /** Seconds */
  playTime?: {
    total: number
    tv: number
  }
  profile?: {
    /** ISO 3166 code, or Lichess-specific values like "_earth" */
    flag?: string
    location?: string
    bio?: string
    realName?: string
    fideRating?: number
  }
  url?: string
}

/** A perf's rating history: [year, month (0-11), day, rating] for each day played. */
export type LichessRatingHistory = { name: string; points: [number, number, number, number][] }[]
