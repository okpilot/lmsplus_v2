import { describe, expect, it } from 'vitest'
import { formatExpiry } from './format-expiry'

describe('formatExpiry', () => {
  it('renders a valid timestamp as a long date and time in UTC', () => {
    expect(formatExpiry('2026-04-29T15:30:00.000Z')).toBe('29 April 2026 at 15:30')
  })

  it('returns the input unchanged when it is not a valid date', () => {
    expect(formatExpiry('not-a-date')).toBe('not-a-date')
  })
})
