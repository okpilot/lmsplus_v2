import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRouterPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

const mockBatchSubmitQuiz = vi.fn()
vi.mock('../../actions/batch-submit', () => ({
  batchSubmitQuiz: (...args: unknown[]) => mockBatchSubmitQuiz(...args),
}))

const mockDeleteDraft = vi.fn()
const mockSaveDraft = vi.fn()
vi.mock('../../actions/draft', () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}))
vi.mock('../../actions/draft-delete', () => ({
  deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
}))

const mockCheckAnswer = vi.fn()
vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...args: unknown[]) => mockCheckAnswer(...args),
}))

vi.mock('../../_components/finish-quiz-dialog', () => ({
  FinishQuizDialog: ({
    open,
    answeredCount,
    totalQuestions,
    submitting,
    onSubmit,
    onCancel,
  }: {
    open: boolean
    answeredCount: number
    totalQuestions: number
    submitting: boolean
    onSubmit: () => void
    onCancel: () => void
  }) =>
    open ? (
      <div data-testid="finish-dialog">
        <span data-testid="dialog-answered">{answeredCount}</span>
        <span data-testid="dialog-total">{totalQuestions}</span>
        <button type="button" onClick={onSubmit} disabled={submitting}>
          Submit Quiz
        </button>
        <button type="button" onClick={onCancel}>
          Return to Quiz
        </button>
      </div>
    ) : null,
}))

vi.mock('@/app/app/_components/question-card', () => ({
  QuestionCard: ({
    questionText,
    questionNumber,
  }: {
    questionText: string
    questionNumber: number
  }) => (
    <div data-testid="question-card">
      <span data-testid="question-text">{questionText}</span>
      <span data-testid="question-number">{questionNumber}</span>
    </div>
  ),
}))

vi.mock('@/app/app/_components/answer-options', () => ({
  AnswerOptions: ({
    options,
    onSubmit,
    disabled,
    selectedOptionId,
    onSelectionChange,
  }: {
    options: { id: string; text: string }[]
    onSubmit: (id: string) => void
    disabled: boolean
    selectedOptionId?: string | null
    onSelectionChange?: (id: string | null) => void
  }) => (
    <div data-testid="answer-options">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-testid={`option-${o.id}`}
          data-selected={selectedOptionId === o.id ? 'true' : 'false'}
          onClick={() => {
            onSelectionChange?.(o.id)
            onSubmit(o.id)
          }}
          disabled={disabled}
        >
          {o.text}
        </button>
      ))}
      {/* Select-only buttons: trigger onSelectionChange without submitting */}
      {options.map((o) => (
        <button
          key={`select-${o.id}`}
          type="button"
          data-testid={`select-btn-${o.id}`}
          onClick={() => onSelectionChange?.(o.id)}
          disabled={disabled}
        >
          Select only {o.text}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/app/app/_components/session-timer', () => ({
  SessionTimer: () => <span data-testid="session-timer">00:00</span>,
}))

vi.mock('../../_components/question-grid', () => ({
  QuestionGrid: ({
    onNavigate,
    currentIndex,
  }: {
    totalQuestions: number
    currentIndex: number
    pinnedIds: Set<string>
    flaggedIds: Set<string>
    questionIds: string[]
    feedbackMap: Map<string, { isCorrect: boolean }>
    onNavigate: (index: number) => void
  }) => (
    <div data-testid="question-grid">
      <button type="button" data-testid="grid-nav-2" onClick={() => onNavigate(2)}>
        Go to 3
      </button>
      <span data-testid="grid-current">{currentIndex}</span>
    </div>
  ),
}))

vi.mock('./quiz-nav-bar', () => ({
  QuizNavBar: ({
    currentIndex,
    totalQuestions,
    onPrev,
    onNext,
  }: {
    currentIndex: number
    totalQuestions: number
    onPrev: () => void
    onNext: () => void
  }) => (
    <div data-testid="quiz-nav-bar">
      <button type="button" onClick={onPrev} disabled={currentIndex === 0}>
        Previous
      </button>
      <button type="button" onClick={onNext} disabled={currentIndex === totalQuestions - 1}>
        Next
      </button>
    </div>
  ),
}))

vi.mock('../../_components/question-tabs', () => ({
  QuestionTabs: () => <div data-testid="question-tabs" />,
}))

vi.mock('../../_components/explanation-tab', () => ({
  ExplanationTab: () => <div data-testid="explanation-tab" />,
}))

vi.mock('../../_components/comments-tab', () => ({
  CommentsTab: () => <div data-testid="comments-tab" />,
}))

vi.mock('../../_components/statistics-tab', () => ({
  StatisticsTab: () => <div data-testid="statistics-tab" />,
}))

const mockToggleFlag = vi.fn().mockResolvedValue(true)
vi.mock('../_hooks/use-flagged-questions', () => ({
  useFlaggedQuestions: () => ({
    flaggedIds: new Set<string>(),
    isFlagged: () => false,
    toggleFlag: mockToggleFlag,
  }),
}))

import { QuizSession } from './quiz-session'

const QUESTIONS = [
  {
    id: 'q1',
    question_text: 'What is lift?',
    question_image_url: null,
    question_number: '050-01-01-001',
    explanation_text: null,
    explanation_image_url: null,
    options: [
      { id: 'a', text: 'A force' },
      { id: 'b', text: 'A moment' },
    ],
  },
  {
    id: 'q2',
    question_text: 'What is drag?',
    question_image_url: null,
    question_number: '050-01-01-002',
    explanation_text: null,
    explanation_image_url: null,
    options: [
      { id: 'c', text: 'Resistance' },
      { id: 'd', text: 'Thrust' },
    ],
  },
  {
    id: 'q3',
    question_text: 'What is weight?',
    question_image_url: null,
    question_number: null,
    explanation_text: null,
    explanation_image_url: null,
    options: [
      { id: 'e', text: 'Gravity force' },
      { id: 'f', text: 'Mass' },
    ],
  },
]

describe('QuizSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockDeleteDraft.mockResolvedValue({ success: true })
    mockSaveDraft.mockResolvedValue({ success: true })
    mockCheckAnswer.mockResolvedValue({
      success: true,
      isCorrect: true,
      correctOptionId: 'a',
      explanationText: null,
      explanationImageUrl: null,
    })
  })

  it('renders first question on mount', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    expect(screen.getByTestId('question-card')).toBeInTheDocument()
    expect(screen.getByTestId('question-text')).toHaveTextContent('What is lift?')
    expect(screen.getByText(/Question 1 of/)).toBeInTheDocument()
  })

  it('stores answer in state without submitting to server', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    fireEvent.click(screen.getByTestId('option-a'))
    expect(mockBatchSubmitQuiz).not.toHaveBeenCalled()
    // The selected option should be marked
    expect(screen.getByTestId('option-a').dataset.selected).toBe('true')
  })

  it('navigates to next question and back', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)
    expect(screen.getByTestId('question-text')).toHaveTextContent('What is drag?')
    expect(screen.getByText(/Question 2 of/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Previous/ })[0]!)
    expect(screen.getByTestId('question-text')).toHaveTextContent('What is lift?')
    expect(screen.getByText(/Question 1 of/)).toBeInTheDocument()
  })

  it('disables Previous on first question and Next on last', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    expect(screen.getAllByRole('button', { name: /Previous/ })[0]!).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /Next/ })[0]!).toBeEnabled()

    // Navigate to last question
    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)
    expect(screen.getAllByRole('button', { name: /Next/ })[0]!).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /Previous/ })[0]!).toBeEnabled()
  })

  it('shows finish dialog when clicking Finish Test', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    expect(screen.getByTestId('finish-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('dialog-total')).toHaveTextContent('3')
  })

  it('closes finish dialog on cancel', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    expect(screen.getByTestId('finish-dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Return to Quiz' }))
    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
  })

  it('tracks answered count in dialog', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Answer first question
    fireEvent.click(screen.getByTestId('option-a'))

    // Go to second question and answer
    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)
    fireEvent.click(screen.getByTestId('option-c'))

    fireEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    expect(screen.getByTestId('dialog-answered')).toHaveTextContent('2')
  })

  it('submits all answers and redirects to report page', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({
      success: true,
      totalQuestions: 3,
      correctCount: 2,
      scorePercentage: 66.7,
      results: [],
    })

    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Answer a question
    fireEvent.click(screen.getByTestId('option-a'))

    // Open dialog and submit
    fireEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }))

    await waitFor(() => {
      expect(mockBatchSubmitQuiz).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        answers: [
          expect.objectContaining({
            questionId: 'q1',
            selectedOptionId: 'a',
          }),
        ],
      })
    })

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=sess-1')
    })
  })

  it('shows error when batch submission fails', async () => {
    mockBatchSubmitQuiz.mockResolvedValue({
      success: false,
      error: 'Server error occurred',
    })

    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    fireEvent.click(screen.getByTestId('option-a'))
    fireEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred')
    })
  })

  it('preserves selected answer when navigating back to a question', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Answer first question
    fireEvent.click(screen.getByTestId('option-a'))
    expect(screen.getByTestId('option-a').dataset.selected).toBe('true')

    // Navigate away and back
    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: /Previous/ })[0]!)

    // Answer should still be selected
    expect(screen.getByTestId('option-a').dataset.selected).toBe('true')
  })

  it('renders the question grid', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    expect(screen.getByTestId('question-grid')).toBeInTheDocument()
  })

  it('navigates to a question via the grid', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    fireEvent.click(screen.getByTestId('grid-nav-2'))
    expect(screen.getByTestId('question-text')).toHaveTextContent('What is weight?')
    expect(screen.getByText(/Question 3 of/)).toBeInTheDocument()
  })

  it('desktop QuizControls always renders with showSubmit=false', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Desktop QuizControls is hardcoded showSubmit=false — Submit Answer button absent initially
    // (mobile controls also have showSubmit=false until a pending option is set)
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('calls checkAnswer when an option is submitted via the answer options', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    fireEvent.click(screen.getByTestId('option-a'))
    expect(mockCheckAnswer).toHaveBeenCalled()
  })

  it('toggles pin state on the current question', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    const pinBtn = screen.getAllByTestId('pin-button')[0]!
    expect(pinBtn).toHaveTextContent('Pin')
    expect(pinBtn).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(pinBtn)
    expect(pinBtn).toHaveTextContent('Unpin')
    expect(pinBtn).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(pinBtn)
    expect(pinBtn).toHaveTextContent('Pin')
    expect(pinBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('clears pending option when navigating to a different question', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Select an option without submitting — this sets pendingOptionId
    fireEvent.click(screen.getByTestId('select-btn-a'))

    // Submit Answer button should now be present in mobile controls (showSubmit=true)
    expect(screen.getAllByRole('button', { name: /Submit Answer/i })[0]).toBeInTheDocument()

    // Navigate to next question — currentIndex changes, useEffect clears pendingOptionId
    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)

    // Submit Answer button should be gone (pendingOptionId cleared)
    expect(screen.queryByRole('button', { name: /Submit Answer/i })).not.toBeInTheDocument()
  })

  it('clears pending option when navigating via the question grid', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Select an option without submitting
    fireEvent.click(screen.getByTestId('select-btn-a'))
    expect(screen.getAllByRole('button', { name: /Submit Answer/i })[0]).toBeInTheDocument()

    // Navigate via grid jump
    fireEvent.click(screen.getByTestId('grid-nav-2'))

    // Pending selection should be cleared
    expect(screen.queryByRole('button', { name: /Submit Answer/i })).not.toBeInTheDocument()
  })

  it('does not show Submit Answer button before any option is selected', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
    expect(screen.queryByRole('button', { name: /Submit Answer/i })).not.toBeInTheDocument()
  })
})
