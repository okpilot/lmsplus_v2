import { describe, expect, it } from 'vitest'
import { scoreColor } from './score-color'

describe('scoreColor', () => {
  it('returns green for scores at exactly 70%', () => {
    expect(scoreColor(70)).toBe('#22C55E')
  })

  it('returns green for scores above 70%', () => {
    expect(scoreColor(100)).toBe('#22C55E')
    expect(scoreColor(85)).toBe('#22C55E')
    expect(scoreColor(70.1)).toBe('#22C55E')
  })

  it('returns amber for scores at exactly 50%', () => {
    expect(scoreColor(50)).toBe('#F59E0B')
  })

  it('returns amber for scores between 50% and 69.9%', () => {
    expect(scoreColor(60)).toBe('#F59E0B')
    expect(scoreColor(69)).toBe('#F59E0B')
    expect(scoreColor(69.9)).toBe('#F59E0B')
  })

  it('returns red for scores below 50%', () => {
    expect(scoreColor(49)).toBe('#EF4444')
    expect(scoreColor(0)).toBe('#EF4444')
    expect(scoreColor(49.9)).toBe('#EF4444')
  })

  it('uses raw percentage value without rounding — 69.9 is amber not green', () => {
    expect(scoreColor(69.9)).toBe('#F59E0B')
  })
})
