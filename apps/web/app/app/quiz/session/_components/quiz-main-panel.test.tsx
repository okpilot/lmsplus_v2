import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    disabled,
    submitting,
    onSelectionChange,
  }: {
    options: { id: string; text: string }[]
    onSubmit: (id: string) => void
    disabled: boolean
    submitting?: boolean
    selectedOptionId?: string | null
    correctOptionId?: string | null
    onSelectionChange?: (id: string | null) => void
  }) => {
    // Store the forwarded callback so tests can invoke it
    if (onSelectionChange) {
      mockAnswerOptionsOnSelectionChange.mockImplementation(onSelectionChange)
    }
    return (
      <div
        data-testid="answer-options"
        data-disabled={String(disabled)}
        data-submitting={String(submitting ?? false)}
      />
    )
  },
}))

vi.mock('./quiz-tab-content', () => ({
  QuizTabContent: () => <div data-testid="quiz-tab-content" />,
}))

// Fixed payloads the mock inputs fire so a handler swap (text vs dialog) is detectable.
const SHORT_ANSWER_PAYLOAD = 'cleared to land'
const DIALOG_FILL_PAYLOAD = [{ index: 0, text: 'alpha' }]

vi.mock('./short-answer-input', () => ({
  ShortAnswerInput: ({
    onSubmit,
    disabled,
    submitting,
    submittedText,
    isCorrect,
    correctAnswer,
  }: {
    onSubmit: (text: string) => void
    disabled: boolean
    submitting?: boolean
    submittedText?: string | null
    isCorrect?: boolean | null
    correctAnswer?: string | null
  }) => (
    <div
      data-testid="short-answer-input"
      data-disabled={String(disabled)}
      data-submitting={String(submitting ?? false)}
      data-submitted-text={submittedText ?? ''}
      data-is-correct={String(isCorrect ?? '')}
      data-correct-answer={correctAnswer ?? ''}
    >
      <button
        type="button"
        data-testid="short-answer-submit"
        onClick={() => onSubmit(SHORT_ANSWER_PAYLOAD)}
      >
        submit
      </button>
    </div>
  ),
}))

vi.mock('./dialog-fill-input', () => ({
  DialogFillInput: ({
    onSubmit,
    disabled,
    submitting,
    submitted,
  }: {
    template: string
    onSubmit: (blanks: { index: number; text: string }[]) => void
    disabled: boolean
    submitting?: boolean
    submitted?: boolean
    blanks?: { index: number; isCorrect: boolean; canonical: string }[]
  }) => (
    <div
      data-testid="dialog-fill-input"
      data-disabled={String(disabled)}
      data-submitting={String(submitting ?? false)}
      data-submitted={String(submitted ?? false)}
    >
      <button
        type="button"
        data-testid="dialog-fill-submit"
        onClick={() => onSubmit(DIALOG_FILL_PAYLOAD)}
      >
        submit
      </button>
    </div>
  ),
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
    handleTextAnswer: vi.fn(),
    handleDialogFillAnswer: vi.fn(),
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

  describe('answer input per question type', () => {
    it('shows a free-text answer field for a short_answer question', () => {
      const s = makeState({
        question: {
          id: 'q-sa',
          question_text: 'What does ATC say?',
          question_image_url: null,
          question_number: '050-01-01-002',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'short_answer',
          dialog_template: null,
          blanks_safe: null,
        },
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('short-answer-input')).toBeInTheDocument()
      expect(screen.queryByTestId('answer-options')).not.toBeInTheDocument()
      expect(screen.queryByTestId('dialog-fill-input')).not.toBeInTheDocument()
    })

    it('submits the typed text answer for a short_answer question', async () => {
      const handleTextAnswer = vi.fn()
      const s = makeState({
        question: {
          id: 'q-sa',
          question_text: 'What does ATC say?',
          question_image_url: null,
          question_number: '050-01-01-002',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'short_answer',
          dialog_template: null,
          blanks_safe: null,
        },
        handleTextAnswer,
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      await userEvent.click(screen.getByTestId('short-answer-submit'))
      expect(handleTextAnswer).toHaveBeenCalledWith('cleared to land')
    })

    it('submits the filled blanks for a dialog_fill question', async () => {
      const handleDialogFillAnswer = vi.fn()
      const s = makeState({
        question: {
          id: 'q-df',
          question_text: 'Complete the ATC dialog',
          question_image_url: null,
          question_number: '050-01-01-003',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'dialog_fill',
          dialog_template: '[atc] {{0}} runway {{1}}.',
          blanks_safe: [{ index: 0 }, { index: 1 }],
        },
        handleDialogFillAnswer,
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      await userEvent.click(screen.getByTestId('dialog-fill-submit'))
      expect(handleDialogFillAnswer).toHaveBeenCalledWith([{ index: 0, text: 'alpha' }])
    })

    it('shows a fill-in-the-blanks dialog field for a dialog_fill question', () => {
      const s = makeState({
        question: {
          id: 'q-df2',
          question_text: 'Complete the ATC dialog',
          question_image_url: null,
          question_number: '050-01-01-003',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'dialog_fill',
          dialog_template: '[atc] {{0}} runway {{1}}.',
          blanks_safe: [{ index: 0 }, { index: 1 }],
        },
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('dialog-fill-input')).toBeInTheDocument()
      expect(screen.queryByTestId('answer-options')).not.toBeInTheDocument()
      expect(screen.queryByTestId('short-answer-input')).not.toBeInTheDocument()
    })

    it('shows multiple-choice options for a multiple_choice question', () => {
      const s = makeState({
        question: {
          id: 'q-mc',
          question_text: 'What is lift?',
          question_image_url: null,
          question_number: '050-01-01-001',
          explanation_text: null,
          explanation_image_url: null,
          options: [{ id: 'a', text: 'A force' }],
          question_type: 'multiple_choice',
          dialog_template: null,
          blanks_safe: null,
        },
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('answer-options')).toBeInTheDocument()
      expect(screen.queryByTestId('short-answer-input')).not.toBeInTheDocument()
      expect(screen.queryByTestId('dialog-fill-input')).not.toBeInTheDocument()
    })

    it('passes submitting and disabled to ShortAnswerInput correctly', () => {
      const s = makeState({
        question: {
          id: 'q-sa',
          question_text: 'short q',
          question_image_url: null,
          question_number: '050-01-01-002',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'short_answer',
          dialog_template: null,
          blanks_safe: null,
        },
        answering: true,
        submitting: false,
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      const input = screen.getByTestId('short-answer-input')
      // disabled comes from s.submitting (session-level), not s.answering (per-question RPC)
      expect(input).toHaveAttribute('data-disabled', 'false')
      // submitting comes from s.answering — drives the spinner
      expect(input).toHaveAttribute('data-submitting', 'true')
    })

    it('shows short_answer feedback (isCorrect + correctAnswer) after submit', () => {
      const s = makeState({
        question: {
          id: 'q-sa',
          question_text: 'short q',
          question_image_url: null,
          question_number: '050-01-01-002',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'short_answer',
          dialog_template: null,
          blanks_safe: null,
        },
        existingAnswer: { responseText: 'cleared', responseTimeMs: 400 },
        currentFeedback: {
          questionType: 'short_answer',
          isCorrect: false,
          correctAnswer: 'cleared to land',
          explanationText: null,
          explanationImageUrl: null,
        },
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      const input = screen.getByTestId('short-answer-input')
      expect(input).toHaveAttribute('data-submitted-text', 'cleared')
      expect(input).toHaveAttribute('data-is-correct', 'false')
      expect(input).toHaveAttribute('data-correct-answer', 'cleared to land')
    })

    it('does not reveal a grading outcome when the recorded feedback is for another question type', () => {
      const s = makeState({
        question: {
          id: 'q-sa',
          question_text: 'short q',
          question_image_url: null,
          question_number: '050-01-01-002',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'short_answer',
          dialog_template: null,
          blanks_safe: null,
        },
        currentFeedback: {
          questionType: 'multiple_choice',
          isCorrect: true,
          correctOptionId: 'opt-a',
          explanationText: null,
          explanationImageUrl: null,
        },
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      const input = screen.getByTestId('short-answer-input')
      expect(input).toHaveAttribute('data-is-correct', '')
    })

    it('passes submitted flag to DialogFillInput when existingAnswer is present', () => {
      const s = makeState({
        question: {
          id: 'q-df',
          question_text: 'dialog q',
          question_image_url: null,
          question_number: '050-01-01-003',
          explanation_text: null,
          explanation_image_url: null,
          options: [],
          question_type: 'dialog_fill',
          dialog_template: '[atc] {{0}}.',
          blanks_safe: [{ index: 0 }],
        },
        existingAnswer: {
          blankAnswers: [{ index: 0, text: 'alpha' }],
          responseTimeMs: 600,
        },
      } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('dialog-fill-input')).toHaveAttribute('data-submitted', 'true')
    })
  })

  describe('answer options stay enabled during a per-question RPC', () => {
    // Regression guard for the fix in quiz-main-panel.tsx:
    // Before the fix: disabled={s.submitting || s.answering}
    // After the fix:  disabled={s.submitting}
    //
    // When s.answering is true (a per-question checkAnswer RPC is in flight) but
    // s.submitting is false (the session submit has not started), the answer options
    // for the *current* question must NOT be disabled — the user navigated to a new
    // question mid-RPC and must be able to answer it.

    it('does not disable answer options when a per-question RPC is in flight but session submit has not started', () => {
      // answering=true means a checkAnswer RPC is in flight for some question.
      // submitting=false means the final session submit has not been triggered.
      const s = makeState({ answering: true, submitting: false } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('answer-options')).toHaveAttribute('data-disabled', 'false')
    })

    it('disables answer options when the session submit is in progress', () => {
      // submitting=true means the final quiz submission RPC is in flight —
      // no more answers should be accepted.
      const s = makeState({ answering: false, submitting: true } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('answer-options')).toHaveAttribute('data-disabled', 'true')
    })

    it('shows the spinner on the submit control while a per-question RPC is in flight', () => {
      // answering drives the Submit Answer spinner (submitting prop on AnswerOptions).
      const s = makeState({ answering: true, submitting: false } as Partial<QuizState>)
      render(<QuizMainPanel s={s} activeTab="question" userId="test-user-id" />)
      expect(screen.getByTestId('answer-options')).toHaveAttribute('data-submitting', 'true')
    })
  })
})
