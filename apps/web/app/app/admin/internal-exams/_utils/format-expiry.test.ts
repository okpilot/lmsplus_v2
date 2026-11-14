import { describe, expect, it } from 'vitest'
import { formatExpiry } from './format-expiry'

describe('formatExpiry', () => {
  it('formats a valid ISO timestamp as en-GB medium date + short time in UTC', () => {
    const iso = '2026-04-30T12:00:00.000Z'
    const expected = '30 Apr 2026, 12:00 UTC'
    expect(formatExpiry(iso)).toBe(expected)
  })

  it('returns the original string unchanged when the ISO value is not a valid date', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date')
  })
})
