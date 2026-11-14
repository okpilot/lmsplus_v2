import { afterEach, describe, expect, it } from 'vitest'
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

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe('formatDate', () => {
  it('renders the UTC day under America/Los_Angeles', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(formatDate('2026-03-15T00:30:00Z')).toBe('15 Mar 2026 UTC')
  })

  it('renders the UTC day under Pacific/Kiritimati', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    expect(formatDate('2026-03-15T23:30:00Z')).toBe('15 Mar 2026 UTC')
  })

  it('formats an ISO timestamp as DD Mon YYYY in en-GB locale', () => {
    expect(formatDate('2026-03-15T00:00:00Z')).toBe('15 Mar 2026 UTC')
  })

  it('pads single-digit days with a leading zero', () => {
    expect(formatDate('2026-01-05T00:00:00Z')).toBe('05 Jan 2026 UTC')
  })

  it('formats December correctly (end-of-year boundary)', () => {
    expect(formatDate('2025-12-31T00:00:00Z')).toBe('31 Dec 2025 UTC')
  })
})
