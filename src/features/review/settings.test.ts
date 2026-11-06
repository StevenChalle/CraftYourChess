import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CRITERIA } from './criteria'
import { defaultSelection } from './selection'
import { defaultAutoDeepen, parseReviewSettings, sameSettings } from './settings'

const both = ['lichess', 'chesscom'] as const

const saved = (data: object) => JSON.stringify({ version: 1, ...data })

describe('parseReviewSettings', () => {
  it('falls back to the defaults without valid storage', () => {
    const defaults = {
      selection: defaultSelection([...both]),
      criteria: DEFAULT_CRITERIA,
      autoDeepen: defaultAutoDeepen(),
    }
    expect(parseReviewSettings(null, [...both])).toEqual(defaults)
    expect(parseReviewSettings('not json', [...both])).toEqual(defaults)
    expect(parseReviewSettings(JSON.stringify({ version: 99 }), [...both])).toEqual(defaults)
  })

  it('restores saved settings', () => {
    const settings = parseReviewSettings(
      saved({
        selection: {
          sources: ['chesscom'],
          ratings: ['rated'],
          scope: { kind: 'range', from: 1, to: 2, preset: 'month', max: 40 },
          categories: ['blitz'],
          colors: ['black'],
          results: ['loss'],
          opponentRating: { enabled: true, min: 1200, max: 1800 },
        },
        criteria: { errorMinDrop: 15, validMaxDrop: 4 },
        autoDeepen: false,
      }),
      [...both],
    )
    expect(settings).toEqual({
      selection: {
        sources: ['chesscom'],
        ratings: ['rated'],
        scope: { kind: 'range', from: 1, to: 2, preset: 'month', max: 40 },
        categories: ['blitz'],
        colors: ['black'],
        results: ['loss'],
        opponentRating: { enabled: true, min: 1200, max: 1800 },
      },
      criteria: { errorMinDrop: 15, validMaxDrop: 4 },
      autoDeepen: false,
    })
  })

  it("keeps the deepening option's default when none was saved", () => {
    expect(parseReviewSettings(saved({}), [...both]).autoDeepen).toBe(defaultAutoDeepen())
    expect(parseReviewSettings(saved({ autoDeepen: 'yes' }), [...both]).autoDeepen).toBe(
      defaultAutoDeepen(),
    )
  })

  it('replaces invalid fields one by one', () => {
    const settings = parseReviewSettings(
      saved({
        selection: {
          categories: ['hyperbullet'],
          opponentRating: { enabled: true, min: 1800, max: 1200 },
          scope: { kind: 'latest', count: 0 },
        },
        criteria: { errorMinDrop: 4, validMaxDrop: 9 },
      }),
      [...both],
    )
    expect(settings.selection.categories).toEqual(defaultSelection([...both]).categories)
    expect(settings.selection.opponentRating).toEqual({ enabled: false, min: 0, max: 4000 })
    expect(settings.selection.scope).toEqual({ kind: 'latest', count: 10 })
    // Kept consistent: a valid move stays below an error
    expect(settings.criteria).toEqual({ errorMinDrop: 4, validMaxDrop: 3 })
  })

  it('drops an invalid period maximum (no limit)', () => {
    const raw = saved({ selection: { scope: { kind: 'range', from: 1, to: 2, max: 0 } } })
    expect(parseReviewSettings(raw, [...both]).selection.scope).toEqual({
      kind: 'range',
      from: 1,
      to: 2,
    })
  })

  it('only keeps platforms with an account now', () => {
    const raw = saved({ selection: { sources: ['lichess'] } })
    expect(parseReviewSettings(raw, ['chesscom']).selection.sources).toEqual(['chesscom'])
    expect(parseReviewSettings(raw, [...both]).selection.sources).toEqual(['lichess'])
  })
})

describe('sameSettings', () => {
  const base = {
    selection: defaultSelection(['lichess', 'chesscom']),
    criteria: DEFAULT_CRITERIA,
    autoDeepen: true,
  }

  it('ignores the order of the chosen items', () => {
    const reordered = {
      ...base,
      selection: { ...base.selection, sources: ['chesscom' as const, 'lichess' as const] },
    }
    expect(sameSettings(base, reordered)).toBe(true)
  })

  it('tells any change of games or rules', () => {
    const rating = { enabled: true, min: 1200, max: 1800 }
    expect(
      sameSettings(base, { ...base, selection: { ...base.selection, opponentRating: rating } }),
    ).toBe(false)
    // Off, the saved bounds do not change the games
    expect(
      sameSettings(base, {
        ...base,
        selection: { ...base.selection, opponentRating: { ...rating, enabled: false } },
      }),
    ).toBe(true)
    expect(
      sameSettings(base, {
        ...base,
        selection: { ...base.selection, scope: { kind: 'latest', count: 11 } },
      }),
    ).toBe(false)
    expect(
      sameSettings(base, {
        ...base,
        selection: { ...base.selection, scope: { kind: 'range', from: 1, to: 2 } },
      }),
    ).toBe(false)
    expect(sameSettings(base, { ...base, criteria: { errorMinDrop: 12, validMaxDrop: 5 } })).toBe(
      false,
    )
    expect(
      sameSettings(base, { ...base, selection: { ...base.selection, colors: ['white'] } }),
    ).toBe(false)
    const range = { kind: 'range' as const, from: 1, to: 2 }
    expect(
      sameSettings(
        { ...base, selection: { ...base.selection, scope: range } },
        { ...base, selection: { ...base.selection, scope: { ...range, max: 20 } } },
      ),
    ).toBe(false)
  })
})

describe('defaultAutoDeepen', () => {
  it('deepens on a computer, not on a phone', () => {
    const agent = vi.spyOn(navigator, 'userAgent', 'get')
    agent.mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) Chrome/140')
    expect(defaultAutoDeepen()).toBe(true)
    agent.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148')
    expect(defaultAutoDeepen()).toBe(false)
    agent.mockRestore()
  })
})

describe('sameSettings and the deepening option', () => {
  it('does not count the option as a change of the analysis', () => {
    const base = {
      selection: defaultSelection([...both]),
      criteria: DEFAULT_CRITERIA,
      autoDeepen: true,
    }
    expect(sameSettings(base, { ...base, autoDeepen: false })).toBe(true)
  })
})
