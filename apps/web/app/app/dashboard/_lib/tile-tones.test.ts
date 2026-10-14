import { describe, expect, it } from 'vitest'
import { DAILY_GOAL, goalTone, readinessTone, streakTone } from './tile-tones'

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

describe('goalTone', () => {
  it.each([
    [0, 'danger'],
    [1, 'caution'],
    [DAILY_GOAL - 1, 'caution'],
    [DAILY_GOAL, 'success'],
  ] as const)('rates %i questions today as %s', (count, tone) => {
    expect(goalTone(count)).toBe(tone)
  })
})

describe('streakTone', () => {
  it.each([
    [0, 'danger'],
    [1, 'caution'],
    [6, 'caution'],
    [7, 'success'],
  ] as const)('rates a %i-day streak as %s', (days, tone) => {
    expect(streakTone(days)).toBe(tone)
  })
})
