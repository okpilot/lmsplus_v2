import { describe, expect, it } from 'vitest'
import { isNearUtcRollover, UTC_ROLLOVER_MARGIN_MINUTES } from './utc-rollover'

const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 26, h, m, 0))

describe('isNearUtcRollover', () => {
  it('holds inside the margin before midnight UTC', () => {
    expect(isNearUtcRollover(at(23, 60 - UTC_ROLLOVER_MARGIN_MINUTES))).toBe(true)
    expect(isNearUtcRollover(at(23, 59))).toBe(true)
  })

  it('does not hold one minute before the margin opens', () => {
    expect(isNearUtcRollover(at(23, 59 - UTC_ROLLOVER_MARGIN_MINUTES))).toBe(false)
  })

  it('does not hold just after midnight, when a whole UTC day is left', () => {
    // The hour wrapping to 0 must not read as "no minutes left".
    expect(isNearUtcRollover(at(0, 0))).toBe(false)
    expect(isNearUtcRollover(at(0, 1))).toBe(false)
  })

  it('does not hold at midday', () => {
    expect(isNearUtcRollover(at(12, 30))).toBe(false)
  })

  it('ignores the local timezone', () => {
    // Built from UTC parts, so the verdict cannot depend on the runner's offset.
    expect(isNearUtcRollover(new Date(Date.UTC(2026, 10, 26, 23, 55)))).toBe(true)
  })
})
