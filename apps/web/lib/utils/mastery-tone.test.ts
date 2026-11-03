import { describe, expect, it } from 'vitest'
import {
  atGoal,
  goalMeterTone,
  MASTERY_GOAL,
  masteryMeterTone,
  masteryTextClass,
} from './mastery-tone'

describe('mastery tone', () => {
  it('sets the mastery goal at 90', () => {
    expect(MASTERY_GOAL).toBe(90)
  })

  it.each([
    [0, 'data'],
    [89, 'data'],
    [90, 'goal'],
    [100, 'goal'],
  ] as const)('masteryMeterTone(%i) is %s', (pct, tone) => {
    expect(masteryMeterTone(pct)).toBe(tone)
  })

  it.each([
    [0, 'text-muted-foreground'],
    [89, 'text-muted-foreground'],
    [90, 'text-success'],
  ] as const)('masteryTextClass(%i) is %s', (pct, cls) => {
    expect(masteryTextClass(pct)).toBe(cls)
  })

  it.each([
    [0, 50, 'data'],
    [49, 50, 'data'],
    [50, 50, 'goal'],
    [60, 50, 'goal'],
  ] as const)('goalMeterTone(%i, %i) is %s', (value, target, tone) => {
    expect(goalMeterTone(value, target)).toBe(tone)
  })

  it.each([
    [89.6, undefined, true],
    [89.4, undefined, false],
    [90, undefined, true],
    [3, 3, true],
    [2, 3, false],
  ] as const)('atGoal(%d, %s) is %s', (value, target, expected) => {
    expect(atGoal(value, target)).toBe(expected)
  })
})
