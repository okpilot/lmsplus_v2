import { describe, expect, it } from 'vitest'
import { formatDate, truncate } from './question-table-helpers'

describe('truncate', () => {
  it('returns the original string when it is shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('returns the original string when it is exactly max characters', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('truncates to max characters and appends an ellipsis when longer than max', () => {
    expect(truncate('hello world', 5)).toBe('hello…')
  })

  it('truncates topic names at 30 characters (the value used in the table)', () => {
    const name = 'A'.repeat(31)
    expect(truncate(name, 30)).toBe(`${'A'.repeat(30)}…`)
  })

  it('returns an empty string unchanged', () => {
    expect(truncate('', 10)).toBe('')
  })
})

describe('formatDate', () => {
  it('formats an ISO timestamp as DD Mon YYYY in en-GB locale', () => {
    expect(formatDate('2026-03-15T00:00:00Z')).toBe('15 Mar 2026')
  })

  it('pads single-digit days with a leading zero', () => {
    expect(formatDate('2026-01-05T00:00:00Z')).toBe('05 Jan 2026')
  })

  it('formats December correctly (end-of-year boundary)', () => {
    expect(formatDate('2025-12-31T00:00:00Z')).toBe('31 Dec 2025')
  })
})
