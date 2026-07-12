import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'

// ---- Hoisted mocks ----------------------------------------------------------

// next/navigation redirect throws in real Next.js — simulate that so QuizReportView halts.
const mockRedirect = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

const mockGetQuizReportSummary = vi.hoisted(() => vi.fn<() => Promise<QuizReportSummary | null>>())
vi.mock('@/lib/queries/quiz-report', () => ({
  getQuizReportSummary: mockGetQuizReportSummary,
  PAGE_SIZE: 10,
}))

const mockGetQuizReportQuestions = vi.hoisted(() =>
  vi.fn<
    () => Promise<{
      ok: boolean
      questions: unknown[]
      totalCount: number
    }>
  >(),
)
vi.mock('@/lib/queries/quiz-report-questions', () => ({
  getQuizReportQuestions: mockGetQuizReportQuestions,
}))

const mockGetFlaggedQuestionIds = vi.hoisted(() => vi.fn<() => Promise<string[]>>())
vi.mock('@/lib/queries/flagged-questions', () => ({
  getFlaggedQuestionIds: mockGetFlaggedQuestionIds,
}))

// parsePageParam is a pure function (no deps) — use the real implementation so the
// page-overflow redirect test can exercise a real out-of-range page number.

// Stub client components so RTL doesn't need their hook deps. Capture ReportCard's props
// so a test can assert QuizReportView forwards the correct pagination values.
const mockReportCard = vi.hoisted(() => vi.fn())
vi.mock('./_components/report-card', () => ({
  ReportCard: (props: unknown) => {
    mockReportCard(props)
    return <div data-testid="report-card" />
  },
}))
vi.mock('./_components/report-flag-context', () => ({
  ReportFlagProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
}))

// ---- Import under test (AFTER mocks) ----------------------------------------

import { QuizReportView } from './report-view'

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

// ---- Tests ------------------------------------------------------------------

describe('QuizReportView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })
    mockGetQuizReportQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    mockGetFlaggedQuestionIds.mockResolvedValue([])
  })

  describe('page h1', () => {
    it('shows "VFR RT Practice Results" for an RT subject viewed in the vfr-rt namespace', async () => {
      mockGetQuizReportSummary.mockResolvedValue(
        makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' }),
      )
      const jsx = await QuizReportView({
        sessionId: VALID_SESSION_ID,
        pageParam: '1',
        namespace: 'vfr-rt',
      })
      render(jsx)
      expect(screen.getByRole('heading', { name: 'VFR RT Practice Results' })).toBeInTheDocument()
      expect(mockRedirect).not.toHaveBeenCalled()
    })

    it('shows "Quiz Results" for a non-RT subject viewed in the quiz namespace', async () => {
      mockGetQuizReportSummary.mockResolvedValue(makeSummary({ subjectCode: null }))
      const jsx = await QuizReportView({
        sessionId: VALID_SESSION_ID,
        pageParam: '1',
        namespace: 'quiz',
      })
      render(jsx)
      expect(screen.getByRole('heading', { name: 'Quiz Results' })).toBeInTheDocument()
      expect(mockRedirect).not.toHaveBeenCalled()
    })
  })

  describe('namespace redirects', () => {
    it('redirects an RT session viewed under the quiz namespace to /app/vfr-rt/report', async () => {
      mockGetQuizReportSummary.mockResolvedValue(
        makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' }),
      )
      await expect(
        QuizReportView({ sessionId: VALID_SESSION_ID, pageParam: '1', namespace: 'quiz' }),
      ).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith(
        `/app/vfr-rt/report?session=${VALID_SESSION_ID}&page=1`,
      )
    })

    it('redirects a non-RT session viewed under the vfr-rt namespace to /app/quiz/report', async () => {
      mockGetQuizReportSummary.mockResolvedValue(makeSummary({ subjectCode: null }))
      await expect(
        QuizReportView({ sessionId: VALID_SESSION_ID, pageParam: '1', namespace: 'vfr-rt' }),
      ).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith(
        `/app/quiz/report?session=${VALID_SESSION_ID}&page=1`,
      )
    })

    it('omits the page param from the canonical redirect when none was supplied', async () => {
      mockGetQuizReportSummary.mockResolvedValue(
        makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' }),
      )
      await expect(
        QuizReportView({ sessionId: VALID_SESSION_ID, namespace: 'quiz' }),
      ).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith(`/app/vfr-rt/report?session=${VALID_SESSION_ID}`)
    })
  })

  describe('page-overflow redirect', () => {
    it('redirects to the namespace-correct basePath when the page exceeds totalPages', async () => {
      mockGetQuizReportSummary.mockResolvedValue(
        makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' }),
      )
      mockGetQuizReportQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
      await expect(
        QuizReportView({ sessionId: VALID_SESSION_ID, pageParam: '5', namespace: 'vfr-rt' }),
      ).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith(
        `/app/vfr-rt/report?session=${VALID_SESSION_ID}&page=1`,
      )
    })
  })

  describe('report card props', () => {
    it('forwards the resolved summary, questions, page, and live total count to the report card', async () => {
      const summary = makeSummary({ subjectCode: null })
      const questions = [{ questionId: 'q1' }, { questionId: 'q2' }]
      mockGetQuizReportSummary.mockResolvedValue(summary)
      mockGetQuizReportQuestions.mockResolvedValue({ ok: true, questions, totalCount: 12 })
      const jsx = await QuizReportView({
        sessionId: VALID_SESSION_ID,
        pageParam: '2',
        namespace: 'quiz',
      })
      render(jsx)
      expect(mockReportCard).toHaveBeenCalledWith(
        expect.objectContaining({ summary, questions, page: 2, totalCount: 12, pageSize: 10 }),
      )
    })
  })

  describe('missing/invalid session', () => {
    it('redirects to /app/quiz when the session id is missing in the quiz namespace', async () => {
      await expect(QuizReportView({ sessionId: undefined, namespace: 'quiz' })).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith('/app/quiz')
    })

    it('redirects to /app/vfr-rt when the session id is missing in the vfr-rt namespace', async () => {
      await expect(QuizReportView({ sessionId: undefined, namespace: 'vfr-rt' })).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith('/app/vfr-rt')
    })

    it('redirects to the namespace home when the session id is present but not a valid UUID', async () => {
      await expect(QuizReportView({ sessionId: 'not-a-uuid', namespace: 'quiz' })).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith('/app/quiz')
    })

    it('redirects to the namespace home when the summary is null', async () => {
      mockGetQuizReportSummary.mockResolvedValue(null)
      await expect(
        QuizReportView({ sessionId: VALID_SESSION_ID, namespace: 'vfr-rt' }),
      ).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith('/app/vfr-rt')
    })
  })

  describe('questions fetch failure', () => {
    it('redirects to the namespace home when the questions fetch fails', async () => {
      mockGetQuizReportSummary.mockResolvedValue(makeSummary({ subjectCode: null }))
      mockGetQuizReportQuestions.mockResolvedValue({ ok: false, questions: [], totalCount: 0 })
      await expect(
        QuizReportView({ sessionId: VALID_SESSION_ID, namespace: 'quiz' }),
      ).rejects.toThrow()
      expect(mockRedirect).toHaveBeenCalledWith('/app/quiz')
    })
  })
})
