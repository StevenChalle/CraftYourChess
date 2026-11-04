import { describe, expect, it } from 'vitest'
import { barShare, timeBars } from './timeChart'

const clock = { initial: 60, increment: 0, total: 60, remaining: [59, 58, 50, 55] }
const turns = ['white', 'black', 'white', 'black', 'white'] as const

describe('timeBars', () => {
  it('gives each move its mover, time spent and clock left', () => {
    expect(timeBars(clock, [...turns], true)).toEqual([
      { index: 1, mover: 'white', spent: 1, left: 59 },
      { index: 2, mover: 'black', spent: 2, left: 58 },
      { index: 3, mover: 'white', spent: 9, left: 50 },
      { index: 4, mover: 'black', spent: 3, left: 55 },
    ])
  })

  it("leaves the first moves untimed on Lichess's clocks", () => {
    const bars = timeBars(clock, [...turns], false)
    expect(bars[0]).toEqual({ index: 1, mover: 'white', spent: undefined, left: 59 })
    expect(bars[2]?.spent).toBe(9)
  })

  it('stops where the clocks stop', () => {
    expect(timeBars({ ...clock, remaining: [59] }, [...turns], true)).toHaveLength(1)
  })
})

describe('barShare', () => {
  it('grows as the square root of the time', () => {
    expect(barShare(100, 100)).toBe(1)
    expect(barShare(25, 100)).toBe(0.5)
    expect(barShare(0, 100)).toBe(0)
    expect(barShare(5, 0)).toBe(0)
  })
})
