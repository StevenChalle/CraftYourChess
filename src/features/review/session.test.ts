import { beforeEach, describe, expect, it } from 'vitest'
import type { Mistake } from './analyze'
import { DEFAULT_CRITERIA } from './criteria'
import {
  loadOpenAnalysis,
  loadOpenTraining,
  profileKey,
  saveOpenAnalysis,
  saveOpenTraining,
} from './openSession'
import { defaultSelection } from './selection'
import type { OpenTraining } from './sessionContext'

const PROFILE = profileKey({ lichess: 'alice' })

describe('the open analysis and training', () => {
  beforeEach(() => localStorage.clear())

  it('come back for their profile only, until closed', () => {
    const settings = { selection: defaultSelection(['lichess']), criteria: DEFAULT_CRITERIA }
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

  it('ignore what cannot be read', () => {
    localStorage.setItem('craftyourchess:open-training', '{not json')
    expect(loadOpenTraining(PROFILE)).toBeUndefined()
  })
})
