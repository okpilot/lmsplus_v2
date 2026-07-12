import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'

// ---- Hoisted mocks ----------------------------------------------------------

// next/navigation redirect throws in real Next.js — simulate that so canonicalReportBasePath halts.
const mockRedirect = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

// ---- Import under test (AFTER mocks) ----------------------------------------

import {
  canonicalReportBasePath,
  namespaceHome,
  redirectOnPageOverflow,
  UUID_RE,
} from './report-view-logic'

// ---- Fixtures ---------------------------------------------------------------

const VALID_SESSION_ID = '00000000-0000-0000-0000-000000000001'

function makeSummary(overrides: Partial<QuizReportSummary> = {}): QuizReportSummary {
  return {
    sessionId: VALID_SESSION_ID,
    mode: 'quick_quiz',
    subjectName: 'VFR Radio Telephony',
    subjectCode: null,
    totalQuestions: 5,
    answeredQuestions: 5,
    answeredItems: 5,
    correctCount: 4,
    scorePercentage: 80,
    startedAt: '2026-07-08T10:00:00Z',
    endedAt: '2026-07-08T10:05:00Z',
    passed: null,
    timeLimitSeconds: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRedirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  })
})

// ---- namespaceHome ----------------------------------------------------------

describe('namespaceHome', () => {
  it('returns /app/vfr-rt for the vfr-rt namespace', () => {
    expect(namespaceHome('vfr-rt')).toBe('/app/vfr-rt')
  })

  it('returns /app/quiz for the quiz namespace', () => {
    expect(namespaceHome('quiz')).toBe('/app/quiz')
  })
})

// ---- UUID_RE ----------------------------------------------------------------

describe('UUID_RE', () => {
  it('matches a valid UUID', () => {
    expect(UUID_RE.test(VALID_SESSION_ID)).toBe(true)
  })

  it('does not match a non-UUID string', () => {
    expect(UUID_RE.test('not-a-uuid')).toBe(false)
  })
})

// ---- canonicalReportBasePath -------------------------------------------------

describe('canonicalReportBasePath', () => {
  it('redirects an RT-practice summary viewed under the quiz namespace to /app/vfr-rt/report with the page param', () => {
    const summary = makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' })
    expect(() => canonicalReportBasePath(summary, 'quiz', '1')).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(
      `/app/vfr-rt/report?session=${VALID_SESSION_ID}&page=1`,
    )
  })

  it('redirects an RT-practice summary viewed under the quiz namespace to /app/vfr-rt/report without a page param when none was supplied', () => {
    const summary = makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' })
    expect(() => canonicalReportBasePath(summary, 'quiz', undefined)).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(`/app/vfr-rt/report?session=${VALID_SESSION_ID}`)
  })

  it('returns /app/vfr-rt/report without redirecting when an RT-practice summary is viewed under the vfr-rt namespace', () => {
    const summary = makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' })
    const result = canonicalReportBasePath(summary, 'vfr-rt', '1')
    expect(result).toBe('/app/vfr-rt/report')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('returns /app/quiz/report without redirecting when a non-RT summary is viewed under the quiz namespace', () => {
    const summary = makeSummary({ subjectCode: null })
    const result = canonicalReportBasePath(summary, 'quiz', '1')
    expect(result).toBe('/app/quiz/report')
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects a non-RT summary viewed under the vfr-rt namespace to /app/quiz/report', () => {
    const summary = makeSummary({ subjectCode: null })
    expect(() => canonicalReportBasePath(summary, 'vfr-rt', '1')).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(`/app/quiz/report?session=${VALID_SESSION_ID}&page=1`)
  })

  it('percent-encodes a page param containing query-delimiter characters so it cannot inject extra keys', () => {
    const summary = makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' })
    expect(() => canonicalReportBasePath(summary, 'quiz', '1&session=evil')).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(
      `/app/vfr-rt/report?session=${VALID_SESSION_ID}&page=1%26session%3Devil`,
    )
  })

  it('omits the page param from the redirect URL when an empty string is supplied', () => {
    const summary = makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' })
    expect(() => canonicalReportBasePath(summary, 'quiz', '')).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(`/app/vfr-rt/report?session=${VALID_SESSION_ID}`)
  })
})

// ---- redirectOnPageOverflow --------------------------------------------------

describe('redirectOnPageOverflow', () => {
  it('redirects to the last page when the requested page is past the end', () => {
    // 25 answers / 10 per page = 3 pages; page 5 is out of range → clamp to 3
    expect(() => redirectOnPageOverflow('/app/quiz/report', VALID_SESSION_ID, 5, 25, 10)).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(`/app/quiz/report?session=${VALID_SESSION_ID}&page=3`)
  })

  it('does not redirect when the requested page is within range', () => {
    redirectOnPageOverflow('/app/quiz/report', VALID_SESSION_ID, 2, 25, 10)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does not redirect when the requested page equals the last page exactly', () => {
    // 30 answers / 10 per page = 3 pages; page 3 === totalPages → no redirect (strict >)
    redirectOnPageOverflow('/app/quiz/report', VALID_SESSION_ID, 3, 30, 10)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does not redirect on page 1 when there are zero answered questions', () => {
    // Math.max(1, ceil(0/10)) = 1, so page 1 is always valid even with no rows
    redirectOnPageOverflow('/app/vfr-rt/report', VALID_SESSION_ID, 1, 0, 10)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('preserves the supplied base path in the redirect target', () => {
    expect(() => redirectOnPageOverflow('/app/vfr-rt/report', VALID_SESSION_ID, 9, 5, 10)).toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(
      `/app/vfr-rt/report?session=${VALID_SESSION_ID}&page=1`,
    )
  })
})
