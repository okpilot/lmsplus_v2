import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReportQuestionRow } from './report-question-row'

// ---- Fixtures ----------------------------------------------------------------

function makeQuestion(overrides: Partial<QuizReportQuestion> = {}): QuizReportQuestion {
  return {
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
    explanationText: null,
    responseTimeMs: 3000,
    ...overrides,
  }
}

// ---- Tests ------------------------------------------------------------------

describe('ReportQuestionRow', () => {
  describe('question label', () => {
    it('uses questionNumber as label when provided', () => {
      render(
        <ReportQuestionRow question={makeQuestion({ questionNumber: '050-01-001' })} index={0} />,
      )
      expect(screen.getByText(/050-01-001\./)).toBeInTheDocument()
    })

    it('falls back to Q{index+1} when questionNumber is null', () => {
      render(<ReportQuestionRow question={makeQuestion({ questionNumber: null })} index={2} />)
      expect(screen.getByText(/Q3\./)).toBeInTheDocument()
    })
  })

  describe('correct answer', () => {
    it('renders question text for a correct answer', () => {
      render(<ReportQuestionRow question={makeQuestion({ isCorrect: true })} index={0} />)
      expect(screen.getByText('What is lift?')).toBeInTheDocument()
    })

    it('shows the selected answer text for a correct answer', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ isCorrect: true, selectedOptionId: 'opt-a' })}
          index={0}
        />,
      )
      expect(screen.getByText('Upward force')).toBeInTheDocument()
    })

    it('does not show the correct answer row when the answer is correct', () => {
      render(<ReportQuestionRow question={makeQuestion({ isCorrect: true })} index={0} />)
      expect(screen.queryByText('Correct answer:')).not.toBeInTheDocument()
    })
  })

  describe('incorrect answer', () => {
    it('shows the selected (wrong) answer text', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: false,
            selectedOptionId: 'opt-b',
            correctOptionId: 'opt-a',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('Downward force')).toBeInTheDocument()
    })

    it('shows the correct answer row when the answer is incorrect', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: false,
            selectedOptionId: 'opt-b',
            correctOptionId: 'opt-a',
          })}
          index={0}
        />,
      )
      expect(screen.getByText('Correct answer:')).toBeInTheDocument()
      expect(screen.getByText('Upward force')).toBeInTheDocument()
    })

    it('hides the correct answer row when correctOption is not found in options', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({
            isCorrect: false,
            selectedOptionId: 'opt-b',
            correctOptionId: 'opt-unknown',
          })}
          index={0}
        />,
      )
      // correctOption is undefined, so the row should not render
      expect(screen.queryByText('Correct answer:')).not.toBeInTheDocument()
    })
  })

  describe('no answer fallback', () => {
    it('shows "No answer" when selectedOptionId matches no option', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ selectedOptionId: 'opt-nonexistent' })}
          index={0}
        />,
      )
      expect(screen.getByText('No answer')).toBeInTheDocument()
    })
  })

  describe('explanation', () => {
    it('shows explanation text when provided', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ explanationText: 'Lift acts perpendicular to relative wind.' })}
          index={0}
        />,
      )
      expect(screen.getByText('Explanation:')).toBeInTheDocument()
      expect(screen.getByText('Lift acts perpendicular to relative wind.')).toBeInTheDocument()
    })

    it('does not show explanation when explanationText is null', () => {
      render(<ReportQuestionRow question={makeQuestion({ explanationText: null })} index={0} />)
      expect(screen.queryByText('Explanation:')).not.toBeInTheDocument()
    })
  })

  describe('response time', () => {
    it('displays response time in seconds with one decimal place', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 3000 })} index={0} />)
      expect(screen.getByText('3.0s')).toBeInTheDocument()
    })

    it('rounds sub-second times to one decimal place', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 500 })} index={0} />)
      expect(screen.getByText('0.5s')).toBeInTheDocument()
    })

    it('displays longer response times correctly', () => {
      render(<ReportQuestionRow question={makeQuestion({ responseTimeMs: 12500 })} index={0} />)
      expect(screen.getByText('12.5s')).toBeInTheDocument()
    })
  })

  describe('question text truncation', () => {
    it('renders short question text in full', () => {
      render(
        <ReportQuestionRow
          question={makeQuestion({ questionText: 'Short question?' })}
          index={0}
        />,
      )
      expect(screen.getByText('Short question?')).toBeInTheDocument()
    })

    it('truncates question text longer than 80 characters with an ellipsis', () => {
      const longText = 'A'.repeat(90)
      render(<ReportQuestionRow question={makeQuestion({ questionText: longText })} index={0} />)
      const expected = `${'A'.repeat(80)}...`
      expect(screen.getByText(expected)).toBeInTheDocument()
    })

    it('does not truncate text that is exactly 80 characters', () => {
      const exactText = 'A'.repeat(80)
      render(<ReportQuestionRow question={makeQuestion({ questionText: exactText })} index={0} />)
      expect(screen.getByText(exactText)).toBeInTheDocument()
    })
  })
})
