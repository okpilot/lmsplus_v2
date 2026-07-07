import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'

// ---- Hoisted mocks ----------------------------------------------------------

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

vi.mock('@/lib/utils/parse-page-param', () => ({ parsePageParam: () => 1 }))

// Stub client components so RTL doesn't need their hook deps.
vi.mock('./_components/report-card', () => ({
  ReportCard: () => <div data-testid="report-card" />,
}))
vi.mock('./_components/report-flag-context', () => ({
  ReportFlagProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
}))

// ---- Import under test (AFTER mocks) ----------------------------------------

import QuizReportPage from './page'

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

const searchParams = Promise.resolve({ session: VALID_SESSION_ID, page: '1' })

// ---- Tests ------------------------------------------------------------------

describe('QuizReportPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetQuizReportQuestions.mockResolvedValue({ ok: true, questions: [], totalCount: 0 })
    mockGetFlaggedQuestionIds.mockResolvedValue([])
  })

  describe('page h1', () => {
    it('shows "Practice Results" for an RT subject in a non-exam mode', async () => {
      mockGetQuizReportSummary.mockResolvedValue(
        makeSummary({ subjectCode: 'RT', mode: 'quick_quiz' }),
      )
      const jsx = await QuizReportPage({ searchParams })
      render(jsx)
      expect(screen.getByRole('heading', { name: 'Practice Results' })).toBeInTheDocument()
    })

    it('shows "Quiz Results" for a non-RT subject', async () => {
      mockGetQuizReportSummary.mockResolvedValue(makeSummary({ subjectCode: null }))
      const jsx = await QuizReportPage({ searchParams })
      render(jsx)
      expect(screen.getByRole('heading', { name: 'Quiz Results' })).toBeInTheDocument()
    })
  })
})
