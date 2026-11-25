import { describe, expect, it } from 'vitest'
import { fmtDate, formatListDate, formatTitleDate } from './format-dates'

describe('sitting date formatting', () => {
  it('formats the day-only date in UTC with an inline UTC label', () => {
    expect(fmtDate('2026-11-18T09:30:00.000Z')).toBe('18 Nov 2026 UTC')
  })

  it('formats the list date in UTC without a label', () => {
    expect(formatListDate('2026-11-18T09:30:00.000Z')).toBe('18 Nov 2026, 09:30')
  })

  it('formats the title date in UTC with an inline UTC label', () => {
    expect(formatTitleDate('2026-11-18T09:30:00.000Z')).toBe('18 Nov 2026, 09:30 UTC')
  })

  it('does not shift a late UTC time into the next local day', () => {
    expect(formatListDate('2026-11-18T23:59:00.000Z')).toBe('18 Nov 2026, 23:59')
  })
})
