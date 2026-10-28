import { describe, expect, it } from 'vitest'
import { DAILY_GOAL, progressTone, readinessTone, STREAK_TARGET } from './tile-tones'

describe('readinessTone', () => {
  it.each([
    [0, undefined],
    [30, undefined],
    [89, undefined],
    [90, 'success'],
    [100, 'success'],
  ] as const)('rates %i percent readiness as %s', (pct, tone) => {
    expect(readinessTone(pct)).toBe(tone)
  })
})

describe('progressTone', () => {
  it.each([
    [0, DAILY_GOAL, undefined],
    [1, DAILY_GOAL, undefined],
    [DAILY_GOAL - 1, DAILY_GOAL, undefined],
    [DAILY_GOAL, DAILY_GOAL, 'success'],
    [0, STREAK_TARGET, undefined],
    [STREAK_TARGET - 1, STREAK_TARGET, undefined],
    [STREAK_TARGET, STREAK_TARGET, 'success'],
  ] as const)('rates %i of %i as %s (never danger or caution)', (value, target, tone) => {
    expect(progressTone(value, target)).toBe(tone)
  })
})
