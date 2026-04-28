import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'

// ---- Mocks -----------------------------------------------------------------

vi.mock('@/app/app/_components/question-card', () => ({
  QuestionCard: ({ questionText }: { questionText: string }) => (
    <div data-testid="question-card">{questionText}</div>
  ),
}))

const mockAnswerOptionsOnSelectionChange = vi.fn()
vi.mock('@/app/app/_components/answer-options', () => ({
  AnswerOptions: ({
    onSelectionChange,
  }: {
    options: { id: string; text: string }[]
    onSubmit: (id: string) => void
    disabled: boolean
    selectedOptionId?: string | null
    correctOptionId?: string | null
    onSelectionChange?: (id: string | null) => void
  }) => {
    // Store the forwarded callback so tests can invoke it
    if (onSelectionChange) {
      mockAnswerOptionsOnSelectionChange.mockImplementation(onSelectionChange)
    }
    return <div data-testid="answer-options" />
  },
}))

vi.mock('./quiz-tab-content', () => ({
  QuizTabContent: () => <div data-testid="quiz-tab-content" />,
}))

// ---- Subject under test ----------------------------------------------------

import { QuizMainPanel } from './quiz-main-panel'

// ---- Helpers ---------------------------------------------------------------

function makeState(overrides: Partial<QuizState> = {}): QuizState {
  return {
    currentIndex: 0,
    question: {
      id: 'q1',
      question_text: 'What is lift?',
      question_image_url: null,
      question_number: '050-01-01-001',
      explanation_text: null,
      explanation_image_url: null,
      options: [{ id: 'a', text: 'A force' }],
    },
    questionId: 'q1',
    answeredCount: 0,
    existingAnswer: undefined,
    currentFeedback: null,
    questionIds: ['q1'],
    answeredIds: new Set<string>(),
    feedback: new Map(),
    pinnedQuestions: new Set<string>(),
    isPinned: false,
    handleSelectAnswer: vi.fn(),
    navigateTo: vi.fn(),
    navigate: vi.fn(),
    togglePin: vi.fn(),
    error: null,
    submitting: false,
    submitted: { current: false },
    showFinishDialog: false,
    setShowFinishDialog: vi.fn(),
    handleSubmit: vi.fn(),
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
    ...overrides,
  } as unknown as QuizState
}

// ---- Tests -----------------------------------------------------------------

describe('QuizMainPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when question is absent', () => {
    const s = makeState({ question: undefined })
    const { container } = render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the question card with the current question text on the question tab', () => {
    render(<QuizMainPanel s={makeState()} activeTab="question" userId="test-user-id" />)
    expect(screen.getByTestId('question-card')).toHaveTextContent('What is lift?')
  })

  it('renders answer options on the question tab', () => {
    render(<QuizMainPanel s={makeState()} activeTab="question" userId="test-user-id" />)
    expect(screen.getByTestId('answer-options')).toBeInTheDocument()
  })

  it('shows error alert when s.error is set on the question tab', () => {
    const s = makeState({ error: 'Something went wrong' })
    render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('does not render error alert when s.error is null', () => {
    render(
      <QuizMainPanel s={makeState({ error: null })} activeTab="question" userId="test-user-id" />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders QuizTabContent instead of question card when tab is not question', () => {
    render(<QuizMainPanel s={makeState()} activeTab="explanation" userId="test-user-id" />)
    expect(screen.getByTestId('quiz-tab-content')).toBeInTheDocument()
    expect(screen.queryByTestId('question-card')).not.toBeInTheDocument()
  })

  it('renders QuizTabContent for the comments tab', () => {
    render(<QuizMainPanel s={makeState()} activeTab="comments" userId="test-user-id" />)
    expect(screen.getByTestId('quiz-tab-content')).toBeInTheDocument()
  })

  it('renders QuizTabContent for the statistics tab', () => {
    render(<QuizMainPanel s={makeState()} activeTab="statistics" userId="test-user-id" />)
    expect(screen.getByTestId('quiz-tab-content')).toBeInTheDocument()
  })

  describe('onSelectionChange forwarding', () => {
    it('calls onSelectionChange when an answer is selected on the question tab', () => {
      const onSelectionChange = vi.fn()
      render(
        <QuizMainPanel
          s={makeState()}
          activeTab="question"
          userId="test-user-id"
          onSelectionChange={onSelectionChange}
        />,
      )
      // The mock captured the forwarded callback — invoke it to confirm identity
      mockAnswerOptionsOnSelectionChange('opt-x')
      expect(onSelectionChange).toHaveBeenCalledWith('opt-x')
    })

    it('does not forward onSelectionChange when not on question tab', () => {
      const onSelectionChange = vi.fn()
      render(
        <QuizMainPanel
          s={makeState()}
          activeTab="explanation"
          userId="test-user-id"
          onSelectionChange={onSelectionChange}
        />,
      )
      // QuizTabContent is rendered instead of AnswerOptions — callback not wired up
      expect(screen.queryByTestId('answer-options')).not.toBeInTheDocument()
    })
  })
})
