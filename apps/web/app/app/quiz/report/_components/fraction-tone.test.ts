import { describe, expect, it } from 'vitest'
import { FRACTION_TEXT, fractionTone } from './fraction-tone'

describe('fractionTone', () => {
  it('returns all when every item is correct', () => {
    expect(fractionTone(3, 3)).toBe('all')
  })

  it('returns none when no item is correct', () => {
    expect(fractionTone(0, 3)).toBe('none')
  })

  it('returns partial when some items are correct', () => {
    expect(fractionTone(1, 3)).toBe('partial')
  })

  it('returns none, not all, when total is zero', () => {
    expect(fractionTone(0, 0)).toBe('none')
  })
})

describe('FRACTION_TEXT', () => {
  it('maps all to text-success, none to text-danger, partial to text-muted-foreground', () => {
    expect(FRACTION_TEXT.all).toContain('text-success')
    expect(FRACTION_TEXT.none).toContain('text-danger')
    expect(FRACTION_TEXT.partial).toContain('text-muted-foreground')
  })
})
