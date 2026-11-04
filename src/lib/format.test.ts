import { describe, expect, it } from 'vitest'
import { formatClock, formatMoveTime } from './format'

describe('formatMoveTime and formatClock', () => {
  it('shows tenths under 10 s, then seconds, then a clock', () => {
    expect(formatMoveTime(4.26)).toBe('4.3 sec')
    expect(formatMoveTime(12.4)).toBe('12 sec')
    expect(formatMoveTime(65)).toBe('1:05')
    expect(formatClock(105.7)).toBe('1:45')
    expect(formatClock(8.46)).toBe('0:08.4')
    expect(formatClock(3725)).toBe('1:02:05')
  })
})
