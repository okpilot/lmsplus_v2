import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { QuestionBreakdown } from './question-breakdown'

// Stub child row so tests focus on breakdown logic, not row rendering
vi.mock('./report-question-row', () => ({
  ReportQuestionRow: ({ question, index }: { question: QuizReportQuestion; index: number }) => (
    <div data-testid={`question-row-${index}`}>{question.questionText}</div>
  ),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

function makeQuestion(id: string, text: string): QuizReportQuestion {
  return {
    questionId: id,
    questionText: text,
    questionNumber: null,
    isCorrect: true,
    selectedOptionId: 'opt-a',
    correctOptionId: 'opt-a',
    options: [{ id: 'opt-a', text: 'Answer A' }],
    explanationText: null,
    responseTimeMs: 2000,
  }
}

function makeQuestions(count: number): QuizReportQuestion[] {
  return Array.from({ length: count }, (_, i) => makeQuestion(`q${i + 1}`, `Question ${i + 1}`))
}

describe('QuestionBreakdown', () => {
  describe('header', () => {
    it('renders the section heading', () => {
      render(<QuestionBreakdown questions={makeQuestions(3)} />)
      expect(screen.getByText('Question Breakdown')).toBeInTheDocument()
    })

    it('displays the total question count in the header', () => {
      render(<QuestionBreakdown questions={makeQuestions(8)} />)
      expect(screen.getByText('8 questions')).toBeInTheDocument()
    })
  })

  describe('when 5 or fewer questions', () => {
    it('renders all questions without a show-more button', () => {
      render(<QuestionBreakdown questions={makeQuestions(5)} />)
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`question-row-${i}`)).toBeInTheDocument()
      }
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('renders a single question without pagination controls', () => {
      render(<QuestionBreakdown questions={makeQuestions(1)} />)
      expect(screen.getByTestId('question-row-0')).toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('when more than 5 questions (collapsed by default)', () => {
    it('shows only the first 5 rows initially', () => {
      render(<QuestionBreakdown questions={makeQuestions(8)} />)
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`question-row-${i}`)).toBeInTheDocument()
      }
      expect(screen.queryByTestId('question-row-5')).not.toBeInTheDocument()
    })

    it('shows a "showing N of total" hint when collapsed', () => {
      render(<QuestionBreakdown questions={makeQuestions(8)} />)
      expect(screen.getByText('Showing 5 of 8 questions')).toBeInTheDocument()
    })

    it('renders the "Show all N questions" button when collapsed', () => {
      render(<QuestionBreakdown questions={makeQuestions(8)} />)
      expect(screen.getByRole('button', { name: 'Show all 8 questions' })).toBeInTheDocument()
    })

    it('expands to show all rows after clicking "Show all"', async () => {
      const user = userEvent.setup()
      render(<QuestionBreakdown questions={makeQuestions(8)} />)

      await user.click(screen.getByRole('button', { name: 'Show all 8 questions' }))

      for (let i = 0; i < 8; i++) {
        expect(screen.getByTestId(`question-row-${i}`)).toBeInTheDocument()
      }
    })

    it('replaces "Show all" with "Show fewer" after expanding', async () => {
      const user = userEvent.setup()
      render(<QuestionBreakdown questions={makeQuestions(8)} />)

      await user.click(screen.getByRole('button', { name: 'Show all 8 questions' }))

      expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Show all 8 questions' })).not.toBeInTheDocument()
    })

    it('hides the "Showing N of total" hint after expanding', async () => {
      const user = userEvent.setup()
      render(<QuestionBreakdown questions={makeQuestions(8)} />)

      await user.click(screen.getByRole('button', { name: 'Show all 8 questions' }))

      expect(screen.queryByText(/Showing 5 of 8 questions/)).not.toBeInTheDocument()
    })

    it('collapses back to 5 rows after clicking "Show fewer"', async () => {
      const user = userEvent.setup()
      render(<QuestionBreakdown questions={makeQuestions(8)} />)

      await user.click(screen.getByRole('button', { name: 'Show all 8 questions' }))
      await user.click(screen.getByRole('button', { name: 'Show fewer' }))

      expect(screen.queryByTestId('question-row-5')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Show all 8 questions' })).toBeInTheDocument()
    })
  })

  describe('boundary: exactly 6 questions', () => {
    it('shows only 5 rows initially when there are exactly 6 questions', () => {
      render(<QuestionBreakdown questions={makeQuestions(6)} />)
      expect(screen.getByTestId('question-row-4')).toBeInTheDocument()
      expect(screen.queryByTestId('question-row-5')).not.toBeInTheDocument()
    })

    it('shows the expand button for exactly 6 questions', () => {
      render(<QuestionBreakdown questions={makeQuestions(6)} />)
      expect(screen.getByRole('button', { name: 'Show all 6 questions' })).toBeInTheDocument()
    })
  })
})
