import type { QuizReportData } from '@/lib/queries/quiz-report'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReportCard } from './report-card'

const mockReport: QuizReportData = {
  sessionId: 'sess-1',
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
  it('displays score percentage', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getByText('67%')).toBeDefined()
  })

  it('displays correct count out of total', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getByText('2 / 3 correct')).toBeDefined()
  })

  it('displays time taken when endedAt is available', () => {
    render(<ReportCard report={mockReport} />)
    expect(screen.getByText('Time taken: 3m 30s')).toBeDefined()
  })

  it('does not display time taken when endedAt is null', () => {
    const noEndTime = { ...mockReport, endedAt: null }
    render(<ReportCard report={noEndTime} />)
    expect(screen.queryByText(/Time taken/)).toBeNull()
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

  it('applies green color for high score', () => {
    const highScore = { ...mockReport, scorePercentage: 85 }
    render(<ReportCard report={highScore} />)
    const scoreEl = screen.getByText('85%')
    expect(scoreEl.className).toContain('text-green-600')
  })

  it('applies red color for low score', () => {
    const lowScore = { ...mockReport, scorePercentage: 30 }
    render(<ReportCard report={lowScore} />)
    const scoreEl = screen.getByText('30%')
    expect(scoreEl.className).toContain('text-destructive')
  })
})
