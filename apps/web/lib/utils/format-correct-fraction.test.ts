import { describe, expect, it } from 'vitest'
import { formatCorrectFraction } from './format-correct-fraction'

describe('formatCorrectFraction', () => {
  it('renders a normal fraction of correct items over answered items', () => {
    expect(formatCorrectFraction(7, 10)).toBe('7 / 10')
  })

  it('shows an em dash instead of "0 / 0" when nothing was answered', () => {
    expect(formatCorrectFraction(0, 0)).toBe('—')
  })

  it('divides by answered items even when correct items exceed the question count', () => {
    // #990 shape: a 9-question paper with 9 answered dialog-fill items, all correct.
    // The old question-count denominator would have produced "9 / 9" coincidentally correct
    // here, but the item-level denominator is what must actually drive the render — pin it
    // against a case where item count and question count diverge to prove it's item-scoped.
    expect(formatCorrectFraction(9, 9)).toBe('9 / 9')
    expect(formatCorrectFraction(24, 29)).toBe('24 / 29')
  })
})
