import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QuizReportQuestion, QuizReportSummary } from '@/lib/queries/quiz-report'
import { ReportCard } from './report-card'

// ---- Mocks -----------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ toString: () => '' }),
  usePathname: () => '/app/quiz/report',
}))

// ---- Fixtures ---------------------------------------------------------------

const mockSummary: QuizReportSummary = {
  sessionId: 'sess-1',
  mode: 'quick_quiz',
  subjectName: '050 — Meteorology',
  totalQuestions: 3,
  answeredCount: 3,
  correctCount: 2,
  scorePercentage: 66.67,
  startedAt: '2026-03-12T10:00:00Z',
  endedAt: '2026-03-12T10:03:30Z',
}

const mockQuestions: QuizReportQuestion[] = [
  {
    questionId: 'q1',
    questionText: 'What is lift?',
    questionNumber: '050-01-001',
    isCorrect: true,
    selectedOptionId: 'opt-a',
    correctOptionId: 'opt-a',
    options: [
      { id: 'opt-a', text: 'Upward force' },
      { id: 'opt-b', text: 'Downward force' },
    ],
    explanationText: 'Lift acts perpendicular to the relative wind.',
    explanationImageUrl: null,
    responseTimeMs: 3000,
  },
  {
    questionId: 'q2',
    questionText: 'What is drag?',
    questionNumber: '050-01-002',
    isCorrect: false,
    selectedOptionId: 'opt-c',
    correctOptionId: 'opt-d',
    options: [
      { id: 'opt-c', text: 'Forward force' },
      { id: 'opt-d', text: 'Opposing force' },
    ],
    explanationText: null,
    explanationImageUrl: null,
    responseTimeMs: 5000,
  },
  {
    questionId: 'q3',
    questionText: 'What controls yaw?',
    questionNumber: null,
    isCorrect: true,
    selectedOptionId: 'opt-e',
    correctOptionId: 'opt-e',
    options: [
      { id: 'opt-e', text: 'Rudder' },
      { id: 'opt-f', text: 'Ailerons' },
    ],
    explanationText: null,
    explanationImageUrl: null,
    responseTimeMs: 2500,
  },
]

const defaultProps = {
  summary: mockSummary,
  questions: mockQuestions,
  page: 1,
  totalCount: 3,
  pageSize: 10,
}

describe('ReportCard', () => {
  it('renders the score ring with rounded percentage', () => {
    render(<ReportCard {...defaultProps} />)
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
  })

  it('displays subject name in stats', () => {
    render(<ReportCard {...defaultProps} />)
    expect(screen.getAllByText('050 — Meteorology').length).toBeGreaterThan(0)
  })

  it('displays correct count in stats', () => {
    render(<ReportCard {...defaultProps} />)
    expect(screen.getAllByText('2 / 3').length).toBeGreaterThan(0)
  })

  it('renders all question rows', () => {
    render(<ReportCard {...defaultProps} />)
    expect(screen.getByText(/What is lift/)).toBeDefined()
    expect(screen.getByText(/What is drag/)).toBeDefined()
    expect(screen.getByText(/What controls yaw/)).toBeDefined()
  })

  it('shows navigation links', () => {
    render(<ReportCard {...defaultProps} />)
    expect(screen.getByText('Quiz Reports')).toBeDefined()
    expect(screen.getByText('Start Another Quiz')).toBeDefined()
  })

  it('links Quiz Reports button to /app/reports', () => {
    render(<ReportCard {...defaultProps} />)
    const link = screen.getByText('Quiz Reports').closest('a')
    expect(link).toHaveAttribute('href', '/app/reports')
  })

  it('shows "Mixed" when subjectName is null', () => {
    const noSubject = { ...defaultProps, summary: { ...mockSummary, subjectName: null } }
    render(<ReportCard {...noSubject} />)
    expect(screen.getAllByText('Mixed').length).toBeGreaterThan(0)
  })

  it('shows question breakdown header with count', () => {
    render(<ReportCard {...defaultProps} />)
    expect(screen.getByText('Question Breakdown')).toBeDefined()
    expect(screen.getByText('3 questions')).toBeDefined()
  })
})
