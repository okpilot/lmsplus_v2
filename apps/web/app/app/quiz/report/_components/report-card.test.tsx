import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QuizReportData } from '@/lib/queries/quiz-report'
import { ReportCard } from './report-card'

const mockReport: QuizReportData = {
  sessionId: 'sess-1',
  mode: 'quick_quiz',
  subjectName: '050 — Meteorology',
  totalQuestions: 3,
  answeredCount: 3,
  correctCount: 2,
  scorePercentage: 66.67,
  startedAt: '2026-03-12T10:00:00Z',
  endedAt: '2026-03-12T10:03:30Z',
  questions: [
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
      responseTimeMs: 2500,
    },
  ],
}

describe('ReportCard', () => {
  it('renders the score ring with rounded percentage', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
  })

  it('displays subject name in stats', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getAllByText('050 — Meteorology').length).toBeGreaterThan(0)
  })

  it('displays correct count in stats', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getAllByText('2 / 3').length).toBeGreaterThan(0)
  })

  it('renders all question rows', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getByText(/What is lift/)).toBeDefined()
    expect(screen.getByText(/What is drag/)).toBeDefined()
    expect(screen.getByText(/What controls yaw/)).toBeDefined()
  })

  it('shows navigation links', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getByText('Back to Dashboard')).toBeDefined()
    expect(screen.getByText('Start Another Quiz')).toBeDefined()
  })

  it('shows "Mixed" when subjectName is null', () => {
    const noSubject = { ...mockReport, subjectName: null }
    render(<ReportCard report={noSubject} />)
    expect(screen.getAllByText('Mixed').length).toBeGreaterThan(0)
  })

  it('shows question breakdown header with count', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getByText('Question Breakdown')).toBeDefined()
    expect(screen.getByText('3 questions')).toBeDefined()
  })
})
