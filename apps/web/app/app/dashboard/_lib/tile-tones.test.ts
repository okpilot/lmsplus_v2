import { describe, expect, it } from 'vitest'
import { DAILY_GOAL, progressTone, readinessTone, STREAK_TARGET } from './tile-tones'

describe('readinessTone', () => {
  it.each([
    [0, 'danger'],
    [30, 'danger'],
    [31, 'caution'],
    [70, 'caution'],
    [71, 'success'],
    [100, 'success'],
  ] as const)('rates %i%% readiness as %s', (pct, tone) => {
    expect(readinessTone(pct)).toBe(tone)
  })
})

describe('progressTone', () => {
  it.each([
    [0, DAILY_GOAL, 'danger'],
    [1, DAILY_GOAL, 'caution'],
    [DAILY_GOAL - 1, DAILY_GOAL, 'caution'],
    [DAILY_GOAL, DAILY_GOAL, 'success'],
    [0, STREAK_TARGET, 'danger'],
    [1, STREAK_TARGET, 'caution'],
    [STREAK_TARGET - 1, STREAK_TARGET, 'caution'],
    [STREAK_TARGET, STREAK_TARGET, 'success'],
  ] as const)('rates %i of %i as %s', (value, target, tone) => {
    expect(progressTone(value, target)).toBe(tone)
  })
})
