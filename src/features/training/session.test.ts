import { describe, expect, it } from 'vitest'
import type { Mistake } from '@/features/review/analyze'
import {
  missedPuzzles,
  shuffle,
  resumeTraining,
  startTraining,
  summarize,
  trainingReducer,
  type TrainingAction,
  type TrainingState,
} from './session'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const mistake = (id: string) => ({ id, fen: START, color: 'white' }) as Mistake

function run(state: TrainingState, ...actions: TrainingAction[]): TrainingState {
  return actions.reduce(trainingReducer, state)
}

describe('shuffle', () => {
  it('keeps every item, in an order set by the random source', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1])
    expect(shuffle([1, 2, 3, 4], () => 0.999)).toEqual([1, 2, 3, 4])
  })
})

describe('trainingReducer', () => {
  const start = () => startTraining([mistake('a'), mistake('b')])

  it('validates a good move, then moves to the next position', () => {
    const state = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: true, afterCp: 0 },
    )
    expect(state).toMatchObject({ status: 'solved', attempts: 1, tried: 'e2e4', triedCp: 0 })
    expect(run(state, { type: 'next' })).toMatchObject({
      index: 1,
      status: 'thinking',
      attempts: 0,
      tried: undefined,
      results: ['first-try'],
    })
  })

  it('lets the player retry after a wrong move', () => {
    const state = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: false, afterCp: 0 },
    )
    expect(state.status).toBe('wrong')
    const withReply = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: false, afterCp: -200, reply: 'd8h4' },
    )
    expect(withReply.triedReply).toBe('d8h4')
    expect(run(withReply, { type: 'retry' }).triedReply).toBeUndefined()
    const solved = run(
      state,
      { type: 'retry' },
      { type: 'try', uci: 'd2d4' },
      { type: 'verdict', puzzleId: 'a', valid: true, afterCp: 0 },
      { type: 'next' },
    )
    expect(solved.results).toEqual(['after-retries'])
  })

  it('reveals the solution once the best move is known', () => {
    const wrong = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: false, afterCp: 0 },
    )
    expect(run(wrong, { type: 'reveal' }).status).toBe('wrong')
    const revealed = run(
      wrong,
      { type: 'best', puzzleId: 'a', uci: 'g1f3', cp: 30, validMoves: [], validCapped: false },
      { type: 'reveal' },
    )
    expect(revealed).toMatchObject({ status: 'revealed', best: 'g1f3' })
    expect(run(revealed, { type: 'next' }).results).toEqual(['revealed'])
  })

  it('lets the player explore other moves once solved, without changing the result', () => {
    const solved = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: true, afterCp: 0 },
    )
    const exploring = run(
      solved,
      { type: 'explore' },
      { type: 'try', uci: 'f2f3' },
      { type: 'verdict', puzzleId: 'a', valid: false, afterCp: -300 },
    )
    expect(exploring).toMatchObject({ status: 'wrong', outcome: 'first-try' })
    expect(run(exploring, { type: 'next' })).toMatchObject({ index: 1, results: ['first-try'] })
  })

  it('cannot move on before the position is settled', () => {
    const wrong = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: false, afterCp: 0 },
    )
    expect(run(wrong, { type: 'next' }).index).toBe(0)
  })

  it('lists the valid moves, adding one found beyond the engine lines', () => {
    const state = run(
      startTraining([{ id: 'a', fen: START } as Mistake]),
      {
        type: 'best',
        puzzleId: 'a',
        uci: 'e2e4',
        cp: 40,
        validMoves: [
          { uci: 'e2e4', cp: 40 },
          { uci: 'd2d4', cp: 20 },
        ],
        validCapped: false,
      },
      { type: 'try', uci: 'c2c4' },
      { type: 'verdict', puzzleId: 'a', valid: true, afterCp: 30 },
      { type: 'explore' },
      { type: 'try', uci: 'd2d4' },
      { type: 'verdict', puzzleId: 'a', valid: true, afterCp: 20 },
    )
    expect(state.validMoves?.map((move) => move.uci)).toEqual(['e2e4', 'c2c4', 'd2d4'])
  })

  it('ignores late answers about another position', () => {
    const state = run(
      start(),
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'b', valid: true, afterCp: 0 },
      { type: 'best', puzzleId: 'b', uci: 'g1f3', cp: 30, validMoves: [], validCapped: false },
    )
    expect(state.status).toBe('checking')
    expect(state.best).toBeUndefined()
  })

  it('ends with the summary', () => {
    const solve = (id: string): TrainingAction[] => [
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: id, valid: true, afterCp: 0 },
      { type: 'next' },
    ]
    const state = run(start(), ...solve('a'), ...solve('b'))
    expect(state.status).toBe('summary')
    expect(summarize(state.results)).toEqual({ 'first-try': 2, 'after-retries': 0, revealed: 0 })
  })
})

describe('evaluating the position', () => {
  const best = (puzzleId: string, cp: number): TrainingAction => ({
    type: 'best',
    puzzleId,
    uci: 'e2e4',
    cp,
    validMoves: [],
    validCapped: false,
  })

  it('evaluates, then finds a move, with both exercises', () => {
    const state = startTraining([mistake('a'), mistake('b')], ['evaluate', 'replay'])
    expect(state.status).toBe('evaluating')
    // The board is not played while evaluating.
    expect(run(state, { type: 'try', uci: 'e2e4' }).status).toBe('evaluating')
    const evaluated = run(state, { type: 'assess', answer: 'white-better' })
    expect(evaluated.status).toBe('evaluated')
    // Waits for the engine's evaluation before going on.
    expect(run(evaluated, { type: 'next' }).status).toBe('evaluated')
    const part2 = run(evaluated, best('a', 120), { type: 'next' })
    expect(part2).toMatchObject({ status: 'thinking', index: 0, assessment: 'white-better' })
    const done = run(
      part2,
      { type: 'try', uci: 'e2e4' },
      { type: 'verdict', puzzleId: 'a', valid: true, afterCp: 120 },
      { type: 'next' },
    )
    expect(done).toMatchObject({
      index: 1,
      status: 'evaluating',
      results: ['first-try'],
      assessments: [true],
      assessment: undefined,
    })
  })

  it('goes straight to the next position without the replay exercise', () => {
    const state = run(
      startTraining([mistake('a'), mistake('b')], ['evaluate']),
      { type: 'assess', answer: 'equal' },
      best('a', 120),
      { type: 'next' },
    )
    expect(state).toMatchObject({
      index: 1,
      status: 'evaluating',
      results: [],
      assessments: [false],
    })
  })

  it('judges the evaluation from White side, whatever the player color', () => {
    const black = { ...mistake('a'), color: 'black' } as Mistake
    // +1.2 for Black, so Black is better
    const state = run(
      startTraining([black], ['evaluate']),
      { type: 'assess', answer: 'black-better' },
      best('a', 120),
      { type: 'next' },
    )
    expect(state).toMatchObject({ status: 'summary', assessments: [true] })
  })
})

describe('missedPuzzles', () => {
  it('keeps the positions not solved at first, in the order played', () => {
    const puzzles = ['a', 'b', 'c', 'd'].map(mistake)
    const missed = missedPuzzles({
      puzzles,
      results: ['first-try', 'revealed', 'first-try', 'after-retries'],
    })
    expect(missed.map((puzzle) => puzzle.id)).toEqual(['b', 'd'])
    // Positions not played yet are not missed.
    expect(missedPuzzles({ puzzles, results: ['after-retries'] }).map((p) => p.id)).toEqual(['a'])
  })
})

describe('resumeTraining', () => {
  it('takes a training up again at its position, the ones done keeping their results', () => {
    const puzzles = ['a', 'b', 'c'].map(mistake)
    const state = resumeTraining(puzzles, ['evaluate', 'replay'], {
      index: 1,
      results: ['first-try'],
      assessments: [true],
    })
    expect(state).toMatchObject({ index: 1, status: 'evaluating', attempts: 0 })
    expect(state.results).toEqual(['first-try'])
    expect(state.assessments).toEqual([true])
  })

  it('shows the summary of a training played to the end', () => {
    const puzzles = ['a', 'b'].map(mistake)
    const state = resumeTraining(puzzles, undefined, {
      index: 2,
      results: ['first-try', 'revealed'],
      assessments: [],
    })
    expect(state.status).toBe('summary')
  })
})
