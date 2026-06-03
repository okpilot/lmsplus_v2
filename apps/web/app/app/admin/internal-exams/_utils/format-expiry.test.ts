import { describe, expect, it } from 'vitest'
import { formatExpiry } from './format-expiry'

describe('formatExpiry', () => {
  it('formats a valid ISO timestamp with en-GB medium date + short time', () => {
    const iso = '2026-04-30T12:00:00.000Z'
    // Compute the expectation with the SAME Intl options so the assertion is not
    // host-timezone-sensitive (formatExpiry omits an explicit timeZone, so the rendered
    // calendar day/time depends on the runner's TZ).
    const expected = new Date(iso).toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    expect(formatExpiry(iso)).toBe(expected)
  })

  it('returns the original string unchanged when the ISO value is not a valid date', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date')
  })
})
