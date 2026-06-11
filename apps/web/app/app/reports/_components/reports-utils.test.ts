import { describe, expect, it } from 'vitest'
import { formatDate, formatDurationMinutes, MODE_LABELS } from './reports-utils'

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

describe('formatDurationMinutes', () => {
  it('renders minutes only when under an hour', () => {
    expect(formatDurationMinutes(45)).toBe('45m')
  })

  it('renders a zero-minute session as "0m"', () => {
    expect(formatDurationMinutes(0)).toBe('0m')
  })

  it('keeps the minutes-only format at the last minute below an hour', () => {
    expect(formatDurationMinutes(59)).toBe('59m')
  })

  it('switches to the hours tier at exactly one hour', () => {
    expect(formatDurationMinutes(60)).toBe('1h 0m')
  })

  it('renders long sessions with an hours unit instead of raw minutes', () => {
    // 1629 min = 27 h 9 m — the reported raw-minutes case
    expect(formatDurationMinutes(1629)).toBe('27h 9m')
  })
})

describe('MODE_LABELS', () => {
  it('maps smart_review to "Study"', () => {
    expect(MODE_LABELS.smart_review).toBe('Study')
  })

  it('maps quick_quiz to "Study"', () => {
    expect(MODE_LABELS.quick_quiz).toBe('Study')
  })

  it('maps mock_exam to "Practice Exam"', () => {
    expect(MODE_LABELS.mock_exam).toBe('Practice Exam')
  })

  it('returns undefined for unknown mode keys', () => {
    const key = 'unknown_mode'
    expect(MODE_LABELS[key]).toBeUndefined()
  })
})
