import { afterEach, describe, expect, it } from 'vitest'
import { formatExpiry } from './format-expiry'

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe('formatExpiry', () => {
  it('renders the UTC day with a UTC label whatever the host TZ', () => {
    process.env.TZ = 'Pacific/Kiritimati'
    const out = formatExpiry('2026-03-15T23:30:00Z')
    expect(out).toContain('15 Mar 2026')
    expect(out).toMatch(/23:30 UTC$/)
  })

  it('formats a valid ISO timestamp as en-GB medium date + short time in UTC', () => {
    const iso = '2026-04-30T12:00:00.000Z'
    const expected = '30 Apr 2026, 12:00 UTC'
    expect(formatExpiry(iso)).toBe(expected)
  })

  it('returns the original string unchanged when the ISO value is not a valid date', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date')
  })
})
