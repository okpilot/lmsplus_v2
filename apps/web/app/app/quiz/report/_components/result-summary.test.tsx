import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
import { ResultSummary } from './result-summary'

beforeEach(() => {
  vi.resetAllMocks()
})

function makeSummary(overrides: Partial<QuizReportSummary> = {}): QuizReportSummary {
  return {
    sessionId: 'sess-1',
    mode: 'quick_quiz',
    subjectName: '050 — Meteorology',
    subjectCode: null,
    totalQuestions: 10,
    answeredQuestions: 10,
    answeredItems: 10,
    correctCount: 7,
    scorePercentage: 70,
    startedAt: '2026-03-12T10:00:00Z',
    endedAt: '2026-03-12T10:03:30Z',
    passed: null,
    timeLimitSeconds: null,
    ...overrides,
  }
}

describe('ResultSummary', () => {
  describe('score ring', () => {
    it('renders the score ring with the rounded percentage', () => {
      render(<ResultSummary summary={makeSummary({ scorePercentage: 66.67 })} />)
      // Math.round(66.67) = 67
      expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
    })

    it('renders the score as 100% when perfect score', () => {
      render(<ResultSummary summary={makeSummary({ scorePercentage: 100 })} />)
      expect(screen.getAllByText('100%').length).toBeGreaterThan(0)
    })
  })

  describe('subject name', () => {
    it('displays the subject name when provided', () => {
      render(<ResultSummary summary={makeSummary({ subjectName: '050 — Meteorology' })} />)
      expect(screen.getAllByText('050 — Meteorology').length).toBeGreaterThan(0)
    })

    it('shows "Mixed" when subjectName is null', () => {
      render(<ResultSummary summary={makeSummary({ subjectName: null })} />)
      expect(screen.getAllByText('Mixed').length).toBeGreaterThan(0)
    })
  })

  describe('correct count', () => {
    it('displays correct over answered items in the stats', () => {
      // Correct denominator is item-level (answeredItems): dialog_fill blanks count as items.
      render(<ResultSummary summary={makeSummary({ correctCount: 7, answeredItems: 10 })} />)
      expect(screen.getAllByText('7 / 10').length).toBeGreaterThan(0)
    })

    it('uses answered items, not distinct questions, as the correct denominator', () => {
      // 5 questions but 12 items (e.g. dialog blanks); 9 correct items → "9 / 12".
      render(
        <ResultSummary
          summary={makeSummary({
            correctCount: 9,
            answeredItems: 12,
            answeredQuestions: 5,
            totalQuestions: 5,
          })}
        />,
      )
      expect(screen.getAllByText('9 / 12').length).toBeGreaterThan(0)
    })
  })

  describe('skipped questions', () => {
    it('shows zero skipped when all questions were answered', () => {
      render(<ResultSummary summary={makeSummary({ totalQuestions: 10, answeredQuestions: 10 })} />)
      // skipped = 10 - 10 = 0
      expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('shows the number of unanswered questions as skipped', () => {
      render(<ResultSummary summary={makeSummary({ totalQuestions: 10, answeredQuestions: 7 })} />)
      // skipped = 10 - 7 = 3
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('counts skipped at the question level even when items exceed questions', () => {
      // 10 questions, 8 distinct answered (2 skipped), 15 items — skipped uses questions.
      render(
        <ResultSummary
          summary={makeSummary({ totalQuestions: 10, answeredQuestions: 8, answeredItems: 15 })}
        />,
      )
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  describe('duration formatting', () => {
    it('shows the formatted duration when endedAt is provided', () => {
      // 3 min 30 s
      render(
        <ResultSummary
          summary={makeSummary({
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
          summary={makeSummary({
            startedAt: '2026-03-12T10:00:00Z',
            endedAt: '2026-03-12T10:00:45Z',
          })}
        />,
      )
      expect(screen.getAllByText('45s').length).toBeGreaterThan(0)
    })

    it('shows an em dash when endedAt is null', () => {
      render(<ResultSummary summary={makeSummary({ endedAt: null })} />)
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })

    it('keeps the minutes-and-seconds format just under one hour', () => {
      // 59 min 59 s — boundary below the hours tier
      render(
        <ResultSummary
          summary={makeSummary({
            startedAt: '2026-03-12T10:00:00Z',
            endedAt: '2026-03-12T10:59:59Z',
          })}
        />,
      )
      expect(screen.getAllByText('59m 59s').length).toBeGreaterThan(0)
    })

    it('shows the hours tier at exactly one hour', () => {
      render(
        <ResultSummary
          summary={makeSummary({
            startedAt: '2026-03-12T10:00:00Z',
            endedAt: '2026-03-12T11:00:00Z',
          })}
        />,
      )
      expect(screen.getAllByText('1h 0m 0s').length).toBeGreaterThan(0)
    })

    it('renders multi-hour durations with an hours unit instead of raw minutes', () => {
      // 27 h 9 m 43 s (the reported "1629m 43s" case)
      render(
        <ResultSummary
          summary={makeSummary({
            startedAt: '2026-03-12T10:00:00Z',
            endedAt: '2026-03-13T13:09:43Z',
          })}
        />,
      )
      expect(screen.getAllByText('27h 9m 43s').length).toBeGreaterThan(0)
    })
  })

  describe('date display', () => {
    it('uses endedAt for the date label when available', () => {
      render(
        <ResultSummary
          summary={makeSummary({
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
          summary={makeSummary({
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
      render(<ResultSummary summary={makeSummary()} />)
      expect(screen.getByText('Quiz Complete')).toBeInTheDocument()
    })

    it('renders "Practice Complete" for an RT subject in a non-exam mode', () => {
      render(<ResultSummary summary={makeSummary({ mode: 'quick_quiz', subjectCode: 'RT' })} />)
      expect(screen.getByText('Practice Complete')).toBeInTheDocument()
    })

    it('renders "Quiz Complete" for a non-RT subject', () => {
      render(<ResultSummary summary={makeSummary({ mode: 'quick_quiz', subjectCode: 'MET' })} />)
      expect(screen.getByText('Quiz Complete')).toBeInTheDocument()
    })

    it('renders "Practice Exam Complete" for mock_exam mode', () => {
      render(<ResultSummary summary={makeSummary({ mode: 'mock_exam', passed: true })} />)
      expect(screen.getByText('Practice Exam Complete')).toBeInTheDocument()
    })

    it('renders "Internal Exam Complete" for internal_exam mode', () => {
      render(<ResultSummary summary={makeSummary({ mode: 'internal_exam', passed: true })} />)
      expect(screen.getByText('Internal Exam Complete')).toBeInTheDocument()
    })

    it('shows the pass/fail badge for internal_exam mode', () => {
      render(<ResultSummary summary={makeSummary({ mode: 'internal_exam', passed: false })} />)
      expect(screen.getByText('FAILED')).toBeInTheDocument()
    })

    it('renders "VFR RT Mock Exam Complete" for vfr_rt_exam mode even on the RT subject', () => {
      // The exam-mode heading must win over the RT-practice noun branch — an RT-subject
      // exam session is not a practice session (getReportContext only applies to non-exam modes).
      render(
        <ResultSummary
          summary={makeSummary({ mode: 'vfr_rt_exam', subjectCode: 'RT', passed: true })}
        />,
      )
      expect(screen.getByText('VFR RT Mock Exam Complete')).toBeInTheDocument()
    })
  })
})
