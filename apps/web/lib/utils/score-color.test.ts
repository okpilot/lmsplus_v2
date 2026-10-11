import { describe, expect, it } from 'vitest'
import { scoreColor } from './score-color'

describe('scoreColor', () => {
  it('returns green for scores at exactly 70%', () => {
    expect(scoreColor(70)).toBe('var(--success)')
  })

  it('returns green for scores above 70%', () => {
    expect(scoreColor(100)).toBe('var(--success)')
    expect(scoreColor(85)).toBe('var(--success)')
    expect(scoreColor(70.1)).toBe('var(--success)')
  })

  it('returns amber for scores at exactly 50%', () => {
    expect(scoreColor(50)).toBe('var(--caution)')
  })

  it('returns amber for scores between 50% and 69.9%', () => {
    expect(scoreColor(60)).toBe('var(--caution)')
    expect(scoreColor(69)).toBe('var(--caution)')
    expect(scoreColor(69.9)).toBe('var(--caution)')
  })

  it('returns red for scores below 50%', () => {
    expect(scoreColor(49)).toBe('var(--danger)')
    expect(scoreColor(0)).toBe('var(--danger)')
    expect(scoreColor(49.9)).toBe('var(--danger)')
  })

  it('uses raw percentage value without rounding — 69.9 is amber not green', () => {
    expect(scoreColor(69.9)).toBe('var(--caution)')
  })
})
