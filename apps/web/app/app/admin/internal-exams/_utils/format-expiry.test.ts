import { describe, expect, it } from 'vitest'
import { formatExpiry } from './format-expiry'

describe('formatExpiry', () => {
  it('formats a valid ISO timestamp to a human-readable en-GB date and time', () => {
    // 2026-04-30T12:00:00.000Z → "30 Apr 2026, 12:00" in en-GB with medium date + short time
    const result = formatExpiry('2026-04-30T12:00:00.000Z')
    // Date portion is TZ-stable; assert the time component shape too without pinning the hour.
    expect(result).toMatch(/30 Apr 2026, \d{2}:\d{2}/)
  })

  it('returns the original string unchanged when the ISO value is not a valid date', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date')
  })
})
