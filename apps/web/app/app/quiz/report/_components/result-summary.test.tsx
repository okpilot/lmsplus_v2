import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportData } from '@/lib/queries/quiz-report'
import { ResultSummary } from './result-summary'

beforeEach(() => {
  vi.resetAllMocks()
})

function makeReport(overrides: Partial<QuizReportData> = {}): QuizReportData {
  return {
    sessionId: 'sess-1',
    mode: 'quick_quiz',
    subjectName: '050 — Meteorology',
    totalQuestions: 10,
    answeredCount: 10,
    correctCount: 7,
    scorePercentage: 70,
    startedAt: '2026-03-12T10:00:00Z',
    endedAt: '2026-03-12T10:03:30Z',
    questions: [],
    ...overrides,
  }
}

describe('ResultSummary', () => {
  describe('score ring', () => {
    it('renders the score ring with the rounded percentage', () => {
      render(<ResultSummary report={makeReport({ scorePercentage: 66.67 })} />)
      // Math.round(66.67) = 67
      expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
    })

    it('renders the score as 100% when perfect score', () => {
      render(<ResultSummary report={makeReport({ scorePercentage: 100 })} />)
      expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    })
  })

  describe('subject name', () => {
    it('displays the subject name when provided', () => {
      render(<ResultSummary report={makeReport({ subjectName: '050 — Meteorology' })} />)
      expect(screen.getAllByText('050 — Meteorology').length).toBeGreaterThan(0)
    })

    it('shows "Mixed" when subjectName is null', () => {
      render(<ResultSummary report={makeReport({ subjectName: null })} />)
      expect(screen.getAllByText('Mixed').length).toBeGreaterThan(0)
    })
  })

  describe('correct count', () => {
    it('displays correct / answered in the stats', () => {
      render(<ResultSummary report={makeReport({ correctCount: 7, answeredCount: 10 })} />)
      expect(screen.getAllByText('7 / 10').length).toBeGreaterThan(0)
    })
  })

  describe('skipped questions', () => {
    it('shows zero skipped when all questions were answered', () => {
      render(<ResultSummary report={makeReport({ totalQuestions: 10, answeredCount: 10 })} />)
      // skipped = 10 - 10 = 0
      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('shows the number of unanswered questions as skipped', () => {
      render(<ResultSummary report={makeReport({ totalQuestions: 10, answeredCount: 7 })} />)
      // skipped = 10 - 7 = 3
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  describe('duration formatting', () => {
    it('shows the formatted duration when endedAt is provided', () => {
      // 3 min 30 s
      render(
        <ResultSummary
          report={makeReport({
            startedAt: '2026-03-12T10:00:00Z',
            endedAt: '2026-03-12T10:03:30Z',
          })}
        />,
      )
      expect(screen.getAllByText('3m 30s').length).toBeGreaterThan(0)
    })

    it('shows only seconds when duration is under one minute', () => {
      render(
        <ResultSummary
          report={makeReport({
            startedAt: '2026-03-12T10:00:00Z',
            endedAt: '2026-03-12T10:00:45Z',
          })}
        />,
      )
      expect(screen.getAllByText('45s').length).toBeGreaterThan(0)
    })

    it('shows an em dash when endedAt is null', () => {
      render(<ResultSummary report={makeReport({ endedAt: null })} />)
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })
  })

  describe('date display', () => {
    it('uses endedAt for the date label when available', () => {
      render(
        <ResultSummary
          report={makeReport({
            startedAt: '2026-01-01T00:00:00Z',
            endedAt: '2026-03-12T10:03:30Z',
          })}
        />,
      )
      // formatDate uses toLocaleDateString en-GB — "12 Mar 2026"
      const dateLabels = screen.getAllByText(/Mar 2026/)
      expect(dateLabels.length).toBeGreaterThan(0)
    })

    it('falls back to startedAt for the date when endedAt is null', () => {
      render(
        <ResultSummary
          report={makeReport({
            startedAt: '2026-01-15T08:00:00Z',
            endedAt: null,
          })}
        />,
      )
      const dateLabels = screen.getAllByText(/Jan 2026/)
      expect(dateLabels.length).toBeGreaterThan(0)
    })
  })

  describe('section heading', () => {
    it('renders the "Quiz Complete" heading', () => {
      render(<ResultSummary report={makeReport()} />)
      expect(screen.getByText('Quiz Complete')).toBeInTheDocument()
    })
  })
})
