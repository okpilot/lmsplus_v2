import { describe, expect, it } from 'vitest'
import {
  DAILY_GOAL,
  dailyGoalProgress,
  progressTone,
  readinessPct,
  readinessTone,
  STREAK_TARGET,
} from './tile-tones'

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

describe('readinessPct', () => {
  it.each([
    [0, 0, 0],
    [8, 9, 89],
    [9, 9, 100],
  ] as const)('%i of %i subjects is %i percent', (ready, total, pct) => {
    expect(readinessPct(ready, total)).toBe(pct)
  })
})

describe('dailyGoalProgress', () => {
  it.each([
    [0, 0, 50],
    [25, 50, 25],
    [50, 100, 0],
    [70, 100, 0],
  ] as const)('%i questions gives progress %i and remaining %i', (q, progress, remaining) => {
    expect(dailyGoalProgress(q)).toEqual({ progress, remaining })
  })
})
