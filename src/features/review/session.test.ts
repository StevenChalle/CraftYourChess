import { beforeEach, describe, expect, it } from 'vitest'
import type { Mistake } from './analyze'
import { DEFAULT_CRITERIA } from './criteria'
import {
  loadOpenAnalysis,
  loadOpenTraining,
  profileKey,
  saveOpenAnalysis,
  saveOpenTraining,
  trainingCount,
  trainingStarted,
  trainingUnderWay,
} from './openSession'
import { defaultSelection } from './selection'
import type { OpenTraining } from './sessionContext'
import { DEFAULT_TRAINING_SETTINGS } from '@/features/training/settings'

const PROFILE = profileKey({ lichess: 'alice' })

describe('the open analysis and training', () => {
  beforeEach(() => localStorage.clear())

  it('come back for their profile only, until closed', () => {
    const settings = {
      selection: defaultSelection(['lichess']),
      criteria: DEFAULT_CRITERIA,
      autoDeepen: false,
    }
    saveOpenAnalysis(PROFILE, { settings, refs: ['lichess:abc'] })
    expect(loadOpenAnalysis(PROFILE)).toEqual({ settings, refs: ['lichess:abc'] })
    expect(loadOpenAnalysis(profileKey({ lichess: 'bob' }))).toBeUndefined()
    saveOpenAnalysis(PROFILE, undefined)
    expect(loadOpenAnalysis(PROFILE)).toBeUndefined()
  })

  it("bring a training back with its games' dates", () => {
    const playedAt = new Date('2026-10-31T20:39:00Z')
    const mistake = { id: 'm1', game: { playedAt } } as unknown as Mistake
    const training: OpenTraining = {
      mistakes: [mistake],
      validMaxDrop: 5,
      errorMinDrop: 10,
      phase: { kind: 'options' },
      finished: false,
      progress: { index: 0, results: [], assessments: [] },
      from: { to: '/player', search: { lichess: 'alice' } },
    }
    saveOpenTraining(PROFILE, training)
    const back = loadOpenTraining(PROFILE)
    expect(back?.mistakes[0]?.game.playedAt).toEqual(playedAt)
    expect(back?.from).toEqual(training.from)
  })

  it("are not dropped by another profile's closing", () => {
    const settings = {
      selection: defaultSelection(['lichess']),
      criteria: DEFAULT_CRITERIA,
      autoDeepen: false,
    }
    saveOpenAnalysis(PROFILE, { settings })
    saveOpenAnalysis(profileKey({ lichess: 'bob' }), undefined)
    expect(loadOpenAnalysis(PROFILE)).toEqual({ settings })
  })

  it('ignore what cannot be read', () => {
    localStorage.setItem('craftyourchess:open-training', '{not json')
    expect(loadOpenTraining(PROFILE)).toBeUndefined()
  })
})

describe('a training left', () => {
  const puzzles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as unknown as Mistake[]
  const base: OpenTraining = {
    mistakes: puzzles,
    validMaxDrop: 5,
    errorMinDrop: 10,
    phase: { kind: 'running', puzzles, settings: DEFAULT_TRAINING_SETTINGS, run: 1 },
    finished: false,
    from: { to: '/player', search: {} },
  }
  const at = (index: number): OpenTraining => ({
    ...base,
    progress: { index, results: [], assessments: [] },
  })

  it('is kept while launched and not over', () => {
    expect(trainingUnderWay(base)).toBe(true)
    expect(trainingUnderWay(at(2))).toBe(true)
    expect(trainingUnderWay({ ...base, phase: { kind: 'options' } })).toBe(false)
    expect(trainingUnderWay({ ...at(2), finished: true })).toBe(false)
    expect(trainingUnderWay(undefined)).toBe(false)
  })

  it('asks before being replaced once a position is played', () => {
    expect(trainingStarted(base)).toBe(false)
    expect(trainingStarted(at(0))).toBe(false)
    expect(trainingStarted(at(1))).toBe(true)
    expect(trainingStarted({ ...at(3), finished: true })).toBe(false)
  })

  it('tells the position it is at', () => {
    expect(trainingCount(base)).toEqual({ current: 1, total: 3 })
    expect(trainingCount(at(2))).toEqual({ current: 3, total: 3 })
    expect(trainingCount(at(3))).toEqual({ current: 3, total: 3 })
    expect(trainingCount({ ...base, phase: { kind: 'options' } })).toBeUndefined()
  })
})
