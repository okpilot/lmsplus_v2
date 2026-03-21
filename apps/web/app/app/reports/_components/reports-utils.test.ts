import { describe, expect, it } from 'vitest'
import { formatDate, MODE_LABELS } from './reports-utils'

describe('formatDate', () => {
  it('formats an ISO date string as "D Mon YYYY" in en-GB locale', () => {
    // 10 Mar 2026 — fixed date to avoid locale-specific separators
    expect(formatDate('2026-03-10T10:00:00Z')).toBe('10 Mar 2026')
  })

  it('formats a date at the start of the year correctly', () => {
    expect(formatDate('2026-01-01T00:00:00Z')).toBe('1 Jan 2026')
  })

  it('formats a date at the end of the year correctly', () => {
    // Use midday UTC to avoid date rolling over in any local timezone
    expect(formatDate('2025-12-31T12:00:00Z')).toBe('31 Dec 2025')
  })
})

describe('MODE_LABELS', () => {
  it('maps smart_review to "Study"', () => {
    expect(MODE_LABELS['smart_review']).toBe('Study')
  })

  it('maps quick_quiz to "Study"', () => {
    expect(MODE_LABELS['quick_quiz']).toBe('Study')
  })

  it('maps mock_exam to "Exam"', () => {
    expect(MODE_LABELS['mock_exam']).toBe('Exam')
  })

  it('returns undefined for unknown mode keys', () => {
    expect(MODE_LABELS['unknown_mode']).toBeUndefined()
  })
})
