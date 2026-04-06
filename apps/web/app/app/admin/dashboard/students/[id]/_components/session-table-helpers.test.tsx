import { describe, expect, it } from 'vitest'
import { formatDate, formatDuration, SORTABLE_COLUMNS } from './session-table-helpers'

// ---- formatDuration ----------------------------------------------------------

describe('formatDuration', () => {
  it('returns em dash when endedAt is null', () => {
    expect(formatDuration('2026-04-01T10:00:00Z', null)).toBe('\u2014')
  })

  it('returns "<1m" when duration rounds to zero minutes', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T10:00:20Z' // 20 seconds — Math.round(20/60) = 0 → '<1m'
    expect(formatDuration(start, end)).toBe('<1m')
  })

  it('returns minutes-only string when duration is exactly one minute', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T10:01:00Z' // 60 seconds → 1m
    expect(formatDuration(start, end)).toBe('1m')
  })

  it('returns minutes-only string when duration is between 1 and 59 minutes', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T10:45:00Z' // 45 minutes
    expect(formatDuration(start, end)).toBe('45m')
  })

  it('returns "59m" when duration is just under one hour', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T10:59:00Z' // 59 minutes
    expect(formatDuration(start, end)).toBe('59m')
  })

  it('returns hours-and-minutes string when duration is exactly one hour', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T11:00:00Z' // 60 minutes
    expect(formatDuration(start, end)).toBe('1h 0m')
  })

  it('returns hours-and-minutes string when duration spans multiple hours', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T12:30:00Z' // 150 minutes → 2h 30m
    expect(formatDuration(start, end)).toBe('2h 30m')
  })

  it('rounds partial minutes correctly (≥30s rounds up)', () => {
    const start = '2026-04-01T10:00:00Z'
    const end = '2026-04-01T10:01:30Z' // 90 seconds → rounds to 2m
    expect(formatDuration(start, end)).toBe('2m')
  })
})

// ---- formatDate --------------------------------------------------------------

describe('formatDate', () => {
  it('returns em dash when iso is null', () => {
    expect(formatDate(null)).toBe('\u2014')
  })

  it('formats a valid ISO date string in en-GB locale', () => {
    // 1 Apr 2026 — en-GB format: "01 Apr 2026"
    const result = formatDate('2026-04-01T10:00:00Z')
    expect(result).toBe('01 Apr 2026')
  })

  it('formats the first day of the year correctly', () => {
    // Use midday UTC to avoid timezone rollover to Dec 31 in UTC+ environments
    const result = formatDate('2026-01-01T12:00:00Z')
    expect(result).toBe('01 Jan 2026')
  })

  it('formats the last day of the year correctly', () => {
    // Use midday UTC to avoid timezone rollover to Jan 1 in UTC+ environments
    const result = formatDate('2026-12-31T12:00:00Z')
    expect(result).toBe('31 Dec 2026')
  })
})

// ---- COLUMNS -----------------------------------------------------------------

describe('SORTABLE_COLUMNS', () => {
  it('contains exactly 4 sortable column definitions (subject, topic, duration are display-only)', () => {
    expect(SORTABLE_COLUMNS).toHaveLength(4)
  })

  it('includes all expected fields', () => {
    const fields = SORTABLE_COLUMNS.map((c: { field: string }) => c.field)
    expect(fields).toEqual(['date', 'mode', 'score', 'questions'])
  })

  it('has a non-empty label for every column', () => {
    for (const col of SORTABLE_COLUMNS) {
      expect(col.label.length).toBeGreaterThan(0)
    }
  })
})
