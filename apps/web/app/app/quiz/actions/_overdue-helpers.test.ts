import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractPassMark, extractQuestionIds, isExamOverdue } from './_overdue-helpers'

// Per-test fake timers reset to real on teardown — even if an assertion throws
// mid-test, the next test starts with real timers. Mirrors the pattern in
// use-auto-submit-countdown.test.ts. Without this, a thrown assertion can leak
// fake timers into another test file's setup() and cause sporadic failures.
afterEach(() => {
  vi.useRealTimers()
})

// ---- extractQuestionIds ---------------------------------------------------

describe('extractQuestionIds', () => {
  it('returns an array of strings for a valid config', () => {
    const result = extractQuestionIds({ question_ids: ['a', 'b', 'c'] })
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('returns null when config is null', () => {
    expect(extractQuestionIds(null)).toBeNull()
  })

  it('returns null when config is not an object', () => {
    expect(extractQuestionIds('string')).toBeNull()
    expect(extractQuestionIds(42)).toBeNull()
  })

  it('returns null when question_ids is missing', () => {
    expect(extractQuestionIds({})).toBeNull()
  })

  it('returns null when question_ids is not an array', () => {
    expect(extractQuestionIds({ question_ids: 'not-array' })).toBeNull()
  })

  it('returns null when question_ids is an empty array', () => {
    expect(extractQuestionIds({ question_ids: [] })).toBeNull()
  })

  it('returns null when any element is not a string', () => {
    expect(extractQuestionIds({ question_ids: ['valid', 123] })).toBeNull()
  })

  it('returns null when any element is an empty string', () => {
    expect(extractQuestionIds({ question_ids: ['valid', ''] })).toBeNull()
  })
})

// ---- extractPassMark -----------------------------------------------------

describe('extractPassMark', () => {
  it('returns the pass mark for a valid config', () => {
    expect(extractPassMark({ pass_mark: 75 })).toBe(75)
  })

  it('returns null when config is null', () => {
    expect(extractPassMark(null)).toBeNull()
  })

  it('returns null when pass_mark is missing', () => {
    expect(extractPassMark({})).toBeNull()
  })

  it('returns null when pass_mark is zero', () => {
    expect(extractPassMark({ pass_mark: 0 })).toBeNull()
  })

  it('returns null when pass_mark is negative', () => {
    expect(extractPassMark({ pass_mark: -1 })).toBeNull()
  })

  it('returns null when pass_mark exceeds 100', () => {
    expect(extractPassMark({ pass_mark: 101 })).toBeNull()
  })

  it('accepts pass_mark exactly at boundary 100', () => {
    expect(extractPassMark({ pass_mark: 100 })).toBe(100)
  })

  it('accepts pass_mark exactly at boundary 1', () => {
    expect(extractPassMark({ pass_mark: 1 })).toBe(1)
  })

  it('returns null when pass_mark is not a number', () => {
    expect(extractPassMark({ pass_mark: '75' })).toBeNull()
  })

  it('returns null when pass_mark is Infinity', () => {
    expect(extractPassMark({ pass_mark: Infinity })).toBeNull()
  })
})

// ---- isExamOverdue — 30s grace window ------------------------------------
// The function returns true only after startedAt + timeLimitSeconds + 30s.
// This mirrors batch_submit_quiz (mig 047) and complete_overdue_exam_session
// (mig 052). Both TS and SQL must agree on this boundary.

describe('isExamOverdue', () => {
  it('returns false when timeLimitSeconds is zero', () => {
    expect(isExamOverdue(new Date().toISOString(), 0)).toBe(false)
  })

  it('returns false when timeLimitSeconds is negative', () => {
    expect(isExamOverdue(new Date().toISOString(), -60)).toBe(false)
  })

  it('returns false when startedAt is not a valid date string', () => {
    expect(isExamOverdue('not-a-date', 60)).toBe(false)
  })

  it('returns false well before the deadline', () => {
    // started 1 second ago, limit 3600s → nowhere near overdue
    const startedAt = new Date(Date.now() - 1_000).toISOString()
    expect(isExamOverdue(startedAt, 3600)).toBe(false)
  })

  it('returns false at exactly the deadline (no grace elapsed)', () => {
    // Use vi.setSystemTime to freeze Date.now at the exact deadline moment.
    // startedAt = T-60, limit = 60s → deadline = now. Grace not expired yet.
    vi.useFakeTimers()
    const now = Date.now()
    const startedAt = new Date(now - 60_000).toISOString()
    vi.setSystemTime(now)
    expect(isExamOverdue(startedAt, 60)).toBe(false)
    vi.useRealTimers()
  })

  it('returns false at deadline + 29s (within grace window)', () => {
    vi.useFakeTimers()
    const startedAt = new Date(0).toISOString() // epoch
    // now = 0 + 60 000 + 29 000 ms = 89 000 ms
    vi.setSystemTime(60_000 + 29_000)
    expect(isExamOverdue(startedAt, 60)).toBe(false)
    vi.useRealTimers()
  })

  it('returns false at deadline + 30s (exact grace boundary)', () => {
    // Boundary check: the function uses `Date.now() > deadline + grace` (strict),
    // so exactly +30s must NOT be overdue. Mirrors the SQL `>` boundary.
    vi.useFakeTimers()
    const startedAt = new Date(0).toISOString() // epoch
    // now = 0 + 60 000 + 30 000 ms = 90 000 ms (exact deadline + grace)
    vi.setSystemTime(60_000 + 30_000)
    expect(isExamOverdue(startedAt, 60)).toBe(false)
    vi.useRealTimers()
  })

  it('returns true at deadline + 31s (grace window expired)', () => {
    vi.useFakeTimers()
    const startedAt = new Date(0).toISOString() // epoch
    // now = 0 + 60 000 + 31 000 ms = 91 000 ms
    vi.setSystemTime(60_000 + 31_000)
    expect(isExamOverdue(startedAt, 60)).toBe(true)
    vi.useRealTimers()
  })

  it('returns true well past the deadline', () => {
    // started 2 hours ago, limit 60s
    const startedAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    expect(isExamOverdue(startedAt, 60)).toBe(true)
  })
})
