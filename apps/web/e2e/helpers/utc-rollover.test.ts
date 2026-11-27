import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isNearUtcRollover,
  skipIfSeededDayEnded,
  UTC_ROLLOVER_MARGIN_MINUTES,
} from './utc-rollover'

const { mockSkip } = vi.hoisted(() => ({ mockSkip: vi.fn() }))
vi.mock('@playwright/test', () => ({ test: { skip: mockSkip } }))

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
})

describe('skipIfSeededDayEnded', () => {
  const now = (iso: string) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
  }

  afterEach(() => {
    vi.useRealTimers()
    mockSkip.mockReset()
  })

  it('does not skip when seeded on the same UTC day', () => {
    now('2026-11-27T18:00:00Z')
    skipIfSeededDayEnded(new Date('2026-11-27T00:01:00Z'))
    expect(mockSkip).toHaveBeenCalledWith(false, expect.any(String))
  })

  it('skips when seeded on an earlier UTC day', () => {
    now('2026-11-27T12:00:00Z')
    skipIfSeededDayEnded(new Date('2026-11-25T12:00:00Z'))
    expect(mockSkip).toHaveBeenCalledWith(true, expect.any(String))
  })

  it('skips when seeded minutes earlier but before midnight UTC', () => {
    now('2026-11-27T00:01:00Z')
    skipIfSeededDayEnded(new Date('2026-11-26T23:59:00Z'))
    expect(mockSkip).toHaveBeenCalledWith(true, expect.any(String))
  })

  it('skips when seeded on the same day-of-month one month earlier', () => {
    now('2026-11-27T12:00:00Z')
    skipIfSeededDayEnded(new Date('2026-10-27T12:00:00Z'))
    expect(mockSkip).toHaveBeenCalledWith(true, expect.any(String))
  })
})
