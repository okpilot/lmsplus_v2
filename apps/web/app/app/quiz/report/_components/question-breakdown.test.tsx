import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { QuestionBreakdown } from './question-breakdown'

// ---- Mocks -----------------------------------------------------------------

const mockRouterReplace = vi.fn()
const mockSearchParamsToString = vi.fn().mockReturnValue('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => ({ toString: mockSearchParamsToString }),
  usePathname: () => '/app/quiz/report',
}))

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
}))

// Stub child row so tests focus on breakdown rendering, not row internals
vi.mock('./report-question-row', () => ({
  ReportQuestionRow: ({ question, index }: { question: QuizReportQuestion; index: number }) => (
    <div data-testid={`question-row-${index}`}>{question.questionText}</div>
  ),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mockSearchParamsToString.mockReturnValue('')
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
    explanationImageUrl: null,
    responseTimeMs: 2000,
  }
}

function makeQuestions(count: number): QuizReportQuestion[] {
  return Array.from({ length: count }, (_, i) => makeQuestion(`q${i + 1}`, `Question ${i + 1}`))
}

describe('QuestionBreakdown', () => {
  describe('header', () => {
    it('renders the section heading', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(3)} page={1} totalCount={3} pageSize={10} />,
      )
      expect(screen.getByText('Question Breakdown')).toBeInTheDocument()
    })

    it('displays the total question count from totalCount prop', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(8)} page={1} totalCount={25} pageSize={10} />,
      )
      expect(screen.getByText('25 questions')).toBeInTheDocument()
    })
  })

  describe('question rows', () => {
    it('renders all questions passed in', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(5)} page={1} totalCount={5} pageSize={10} />,
      )
      for (let i = 0; i < 5; i++) {
        expect(screen.getByTestId(`question-row-${i}`)).toBeInTheDocument()
      }
    })

    it('renders a single question without pagination controls when only one page', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(1)} page={1} totalCount={1} pageSize={10} />,
      )
      expect(screen.getByTestId('question-row-0')).toBeInTheDocument()
      // PaginationBar renders null when totalPages <= 1
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('page offset indexing', () => {
    it('passes global index based on page offset to ReportQuestionRow', () => {
      // Page 2, pageSize=10: indices should start at 10
      render(
        <QuestionBreakdown questions={makeQuestions(3)} page={2} totalCount={13} pageSize={10} />,
      )
      expect(screen.getByTestId('question-row-10')).toBeInTheDocument()
      expect(screen.getByTestId('question-row-11')).toBeInTheDocument()
      expect(screen.getByTestId('question-row-12')).toBeInTheDocument()
    })
  })

  describe('pagination bar', () => {
    it('does not render pagination controls when all questions fit on one page', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(5)} page={1} totalCount={5} pageSize={10} />,
      )
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('renders pagination controls when there are multiple pages', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(10)} page={1} totalCount={25} pageSize={10} />,
      )
      // PaginationBar renders prev/next buttons
      expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument()
    })

    it('shows "Showing X-Y of Z questions" when multiple pages exist', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(10)} page={1} totalCount={25} pageSize={10} />,
      )
      expect(screen.getByText(/Showing 1–10 of 25 questions/)).toBeInTheDocument()
    })

    it('shows correct range on page 2', () => {
      render(
        <QuestionBreakdown questions={makeQuestions(10)} page={2} totalCount={25} pageSize={10} />,
      )
      expect(screen.getByText(/Showing 11–20 of 25 questions/)).toBeInTheDocument()
    })
  })
})
