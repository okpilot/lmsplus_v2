import { describe, expect, it } from 'vitest'
import { formatCorrectFraction } from './format-correct-fraction'

describe('formatCorrectFraction', () => {
  it('renders a normal fraction of correct items over answered items', () => {
    expect(formatCorrectFraction(7, 10)).toBe('7 / 10')
  })

  it('shows an em dash instead of "0 / 0" when nothing was answered', () => {
    expect(formatCorrectFraction(0, 0)).toBe('—')
  })

  it('renders the fraction when correct items and answered items differ', () => {
    // This function never receives a question count, so nothing here can prove the denominator
    // is item-scoped rather than question-scoped. That discrimination is pinned by the callers'
    // co-located tests, whose fixtures give answeredItems a value distinct from totalQuestions.
    // Derive the current caller set rather than trusting a list here — the set grows:
    //   grep -rl formatCorrectFraction apps/web/app --include="*.tsx"
    expect(formatCorrectFraction(24, 29)).toBe('24 / 29')
  })

  it('renders a zero-correct fraction rather than an em dash when items were answered', () => {
    // The em-dash guard checks answeredItems === 0, not correctCount === 0 — a fixture where
    // correctCount is 0 but answeredItems isn't is the only way to tell those two guards apart.
    expect(formatCorrectFraction(0, 5)).toBe('0 / 5')
  })
})
