import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRouterPush = vi.fn()
const mockRouterReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
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

const mockDiscardQuiz = vi.fn()
vi.mock('../../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

const mockEndDiscovery = vi.fn().mockResolvedValue({ success: true })
vi.mock('../../actions/end-discovery', () => ({
  endDiscovery: (...args: unknown[]) => mockEndDiscovery(...args),
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
    onDiscard,
    isExam,
    timeExpired,
  }: {
    open: boolean
    answeredCount: number
    totalQuestions: number
    submitting: boolean
    onSubmit: () => void
    onCancel: () => void
    onDiscard: () => void
    isExam?: boolean
    timeExpired?: boolean
  }) => {
    if (!open) return null
    const canDismiss = !(timeExpired && isExam)
    return (
      <div
        data-testid="finish-dialog"
        data-is-exam={isExam ? 'true' : 'false'}
        data-time-expired={timeExpired ? 'true' : 'false'}
        data-can-dismiss={canDismiss ? 'true' : 'false'}
      >
        <span data-testid="dialog-answered">{answeredCount}</span>
        <span data-testid="dialog-total">{totalQuestions}</span>
        <button type="button" onClick={onSubmit} disabled={submitting}>
          Submit Quiz
        </button>
        {canDismiss && (
          <button type="button" onClick={onCancel}>
            Return to Quiz
          </button>
        )}
        {canDismiss && (
          <button type="button" onClick={onDiscard}>
            Discard Session
          </button>
        )}
      </div>
    )
  },
}))

vi.mock('../../_components/exam-countdown-timer', () => ({
  ExamCountdownTimer: ({
    onExpired,
    className,
    startedAt,
  }: {
    timeLimitSeconds: number
    startedAt: number
    onExpired: () => void
    className?: string
  }) => (
    <span
      data-testid="exam-countdown-timer"
      data-classname={className ?? ''}
      data-started-at={startedAt}
    >
      <button type="button" data-testid="trigger-expired" onClick={onExpired}>
        Expire
      </button>
    </span>
  ),
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

vi.mock('@/app/app/_components/answer-options', async () => {
  const { useState } = await import('react')

  function AnswerOptions({
    options,
    onSubmit,
    disabled,
    selectedOptionId,
    correctOptionId,
    onSelectionChange,
    isExam,
  }: {
    options: { id: string; text: string }[]
    onSubmit: (id: string) => void
    disabled: boolean
    selectedOptionId?: string | null
    correctOptionId?: string | null
    onSelectionChange?: (id: string | null) => void
    isExam?: boolean
  }) {
    // In exam mode track pending selection locally, mirroring the real component's
    // internal `selected` state. onSubmit fires only when the Confirm Answer button
    // is clicked — not on the option click itself.
    const [pendingId, setPendingId] = useState<string | null>(null)

    return (
      <div data-testid="answer-options">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            data-testid={`option-${o.id}`}
            // Mirrors the real component's isSelected (answer-options.tsx:82): the
            // parent-driven selectedOptionId, or — before the parent commits — the
            // local pendingId. Unselected emits no attribute, like production.
            data-selected={
              selectedOptionId === o.id || (!selectedOptionId && pendingId === o.id)
                ? 'true'
                : undefined
            }
            // showResult marking: when feedback supplies a correctOptionId, the real
            // component paints the correct option green. Mirror that as a flat attribute.
            data-correct={correctOptionId === o.id ? 'true' : undefined}
            onClick={() => {
              onSelectionChange?.(o.id)
              if (!isExam) {
                // Study/practice mode: option click immediately submits, matching the
                // real component where Submit Answer is the only confirm step.
                onSubmit(o.id)
              } else {
                // Exam mode: option click only selects; onSubmit fires via Confirm Answer.
                setPendingId(o.id)
              }
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
        {/* Exam-mode confirm button — mirrors answer-options.tsx line 104 ("Confirm Answer") */}
        {isExam && pendingId && (
          <button
            type="button"
            data-testid="confirm-answer-btn"
            onClick={() => {
              onSubmit(pendingId)
              setPendingId(null)
            }}
            disabled={disabled}
          >
            Confirm Answer
          </button>
        )}
      </div>
    )
  }

  return { AnswerOptions }
})

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
  // Mirrors the real signature: the hook is seeded from the server-provided
  // initialFlaggedIds prop (QuizSession passes props.initialFlaggedIds ?? []).
  useFlaggedQuestions: (initialFlaggedIds: readonly string[]) => ({
    flaggedIds: new Set<string>(initialFlaggedIds),
    isFlagged: (id: string) => initialFlaggedIds.includes(id),
    toggleFlag: mockToggleFlag,
    isToggling: () => false,
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
    question_type: 'multiple_choice' as const,
    dialog_template: null,
    blanks_safe: null,
    ordering_items: null,
    diagram_config: null,
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
    question_type: 'multiple_choice' as const,
    dialog_template: null,
    blanks_safe: null,
    ordering_items: null,
    diagram_config: null,
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
    question_type: 'multiple_choice' as const,
    dialog_template: null,
    blanks_safe: null,
    ordering_items: null,
    diagram_config: null,
  },
]

const mcFeedback = (correctOptionId: string) =>
  ({
    questionType: 'multiple_choice',
    isCorrect: true,
    correctOptionId,
    explanationText: null,
    explanationImageUrl: null,
  }) as const

describe('QuizSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockDeleteDraft.mockResolvedValue({ success: true })
    mockSaveDraft.mockResolvedValue({ success: true })
    mockDiscardQuiz.mockResolvedValue({ success: true })
    mockEndDiscovery.mockResolvedValue({ success: true })
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

    // Answer a question and wait for checkAnswer to resolve (clears pending ref)
    fireEvent.click(screen.getByTestId('option-a'))
    await waitFor(() => expect(mockCheckAnswer).toHaveBeenCalled())

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

    // Answer a question and wait for checkAnswer to resolve (clears pending ref)
    fireEvent.click(screen.getByTestId('option-a'))
    await waitFor(() => expect(mockCheckAnswer).toHaveBeenCalled())

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

  it('does not render Submit Answer button when no option is selected', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)
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

  it('keeps the mobile Submit Answer button (with spinner) mounted while the per-question RPC is in flight', async () => {
    // Regression for #886: the answer is recorded optimistically before checkAnswer
    // resolves, so canSubmitAnswer flips false mid-RPC. Without `|| s.answering` in
    // showSubmit, the footer button unmounts before the spinner can paint. Hold
    // checkAnswer pending to observe the in-flight window.
    let resolveCheck!: (value: unknown) => void
    mockCheckAnswer.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve
        }),
    )

    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Select an option (sets pendingOptionId) so the footer submit button appears
    fireEvent.click(screen.getByTestId('select-btn-a'))
    expect(screen.getByTestId('submit-answer-mobile')).toBeInTheDocument()

    // Tap it → handleSelectAnswer fires, answering=true, checkAnswer awaited (held)
    fireEvent.click(screen.getByTestId('submit-answer-mobile'))

    // While the RPC is in flight the button stays mounted AND shows the spinner
    await waitFor(() =>
      expect(screen.getByTestId('submit-answer-mobile')).toHaveAttribute('aria-busy', 'true'),
    )

    // Resolve the RPC → answer recorded, answering=false → button unmounts once
    resolveCheck({
      success: true,
      isCorrect: true,
      correctOptionId: 'a',
      explanationText: null,
      explanationImageUrl: null,
    })
    await waitFor(() =>
      expect(screen.queryByTestId('submit-answer-mobile')).not.toBeInTheDocument(),
    )
  })

  // ---- Exam-mode onDiscard wiring ------------------------------------------

  it('passes isExam=true to FinishQuizDialog when mode is exam', () => {
    render(
      <QuizSession sessionId="sess-exam" questions={QUESTIONS} userId="test-user-id" mode="exam" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish Practice Exam' }))
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-is-exam', 'true')
  })

  it('calls discardQuiz via onDiscard when Discard Session is clicked in exam mode', async () => {
    render(
      <QuizSession sessionId="sess-exam" questions={QUESTIONS} userId="test-user-id" mode="exam" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Finish Practice Exam' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard Session' }))
    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-exam' }))
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz'))
  })

  it('disables the Finish Test button while a submission is in progress', async () => {
    // Use a promise that never resolves so submitting stays true
    let resolveSubmit!: (value: unknown) => void
    mockBatchSubmitQuiz.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        }),
    )

    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} userId="test-user-id" />)

    // Answer a question and wait for checkAnswer to resolve (clears pending ref)
    fireEvent.click(screen.getByTestId('option-a'))
    await waitFor(() => expect(mockCheckAnswer).toHaveBeenCalled())

    // Open the finish dialog and click submit
    fireEvent.click(screen.getByRole('button', { name: 'Finish Test' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }))

    // While the submission is in flight the Finish Test button must be disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Finish Test' })).toBeDisabled()
    })

    // Clean up — resolve the dangling promise
    resolveSubmit({
      success: true,
      totalQuestions: 3,
      correctCount: 1,
      scorePercentage: 33,
      results: [],
    })
  })

  it('marks session expired even when submit is in flight', async () => {
    // Keep batch submit pending so `s.submitting` stays true the whole time
    let resolveSubmit!: (value: unknown) => void
    mockBatchSubmitQuiz.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        }),
    )

    render(
      <QuizSession
        sessionId="sess-exam"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="exam"
        timeLimitSeconds={1800}
        passMark={75}
      />,
    )

    // Buffer an answer so handleSubmitSession progresses past the empty-answers guard.
    // In exam mode: option click selects only; Confirm Answer fires onSubmit.
    fireEvent.click(screen.getByTestId('option-a'))
    fireEvent.click(screen.getByTestId('confirm-answer-btn'))

    // Open dialog and click Submit so the batch submit is in flight (submitting=true).
    // Pre-fix: when the timer fires later, handleTimeExpired's `s.submitting` guard
    // would short-circuit before setting autoSubmitFiredRef, so the dialog stayed
    // dismissible. Post-fix: the guard is dropped so the ref is set unconditionally.
    fireEvent.click(screen.getByRole('button', { name: 'Finish Practice Exam' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit Quiz' }))
    await waitFor(() => expect(mockBatchSubmitQuiz).toHaveBeenCalled())

    // Time expires while the submit is in flight
    fireEvent.click(screen.getAllByTestId('trigger-expired')[0]!)

    // Resolving the in-flight submit with a failure flips submitting back to
    // false, which triggers a re-render and lets the dialog observe the
    // already-set autoSubmitFiredRef. Without the fix, the ref was never set,
    // so timeExpired stays false even after the re-render.
    resolveSubmit({ success: false, error: 'Server error' })

    await waitFor(() => {
      const dialog = screen.getByTestId('finish-dialog')
      expect(dialog).toHaveAttribute('data-time-expired', 'true')
      expect(dialog).toHaveAttribute('data-can-dismiss', 'false')
    })

    // Dismiss controls are hidden when canDismiss=false
    expect(screen.queryByRole('button', { name: 'Return to Quiz' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Discard Session' })).not.toBeInTheDocument()
  })

  it('flips timeExpired on the open dialog when the timer fires (no submit in flight)', async () => {
    render(
      <QuizSession
        sessionId="sess-exam"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="exam"
        timeLimitSeconds={1800}
        passMark={75}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Finish Practice Exam' }))
    const dialogBefore = screen.getByTestId('finish-dialog')
    expect(dialogBefore).toHaveAttribute('data-time-expired', 'false')
    expect(dialogBefore).toHaveAttribute('data-can-dismiss', 'true')

    fireEvent.click(screen.getAllByTestId('trigger-expired')[0]!)

    await waitFor(() => {
      const dialogAfter = screen.getByTestId('finish-dialog')
      expect(dialogAfter).toHaveAttribute('data-time-expired', 'true')
      expect(dialogAfter).toHaveAttribute('data-can-dismiss', 'false')
    })
  })

  it('passes parsed startedAt timestamp to the exam countdown timer when prop is set', () => {
    const startedAt = '2026-04-27T12:00:00.000Z'
    const expectedMs = new Date(startedAt).getTime()
    render(
      <QuizSession
        sessionId="sess-exam"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="exam"
        timeLimitSeconds={1800}
        passMark={75}
        startedAt={startedAt}
      />,
    )

    const timers = screen.getAllByTestId('exam-countdown-timer')
    for (const t of timers) {
      expect(t.getAttribute('data-started-at')).toBe(String(expectedMs))
    }
  })

  it('falls back to Date.now() for the timer start when startedAt prop is absent', () => {
    const before = Date.now()
    render(
      <QuizSession
        sessionId="sess-exam"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="exam"
        timeLimitSeconds={1800}
        passMark={75}
      />,
    )
    const after = Date.now()

    const timer = screen.getAllByTestId('exam-countdown-timer')[0]!
    const startedAtAttr = Number(timer.getAttribute('data-started-at'))
    expect(startedAtAttr).toBeGreaterThanOrEqual(before)
    expect(startedAtAttr).toBeLessThanOrEqual(after)
  })

  it('falls back to Date.now() when startedAt is a malformed ISO string', () => {
    const before = Date.now()
    render(
      <QuizSession
        sessionId="sess-exam"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="exam"
        timeLimitSeconds={1800}
        passMark={75}
        startedAt="not-a-real-date"
      />,
    )
    const after = Date.now()

    const timer = screen.getAllByTestId('exam-countdown-timer')[0]!
    const startedAtAttr = Number(timer.getAttribute('data-started-at'))
    expect(startedAtAttr).toBeGreaterThanOrEqual(before)
    expect(startedAtAttr).toBeLessThanOrEqual(after)
  })

  it('hides the header countdown timer on desktop breakpoint', () => {
    render(
      <QuizSession
        sessionId="sess-exam"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="exam"
        timeLimitSeconds={1800}
        passMark={75}
      />,
    )

    const timers = screen.getAllByTestId('exam-countdown-timer')
    // Two instances render (header + main), but only one is visible on each breakpoint:
    // header has `md:hidden` (mobile-only), main has `hidden md:inline` (desktop-only)
    expect(timers).toHaveLength(2)
    const headerTimer = timers[0]!
    const mainTimer = timers[1]!
    expect(headerTimer.getAttribute('data-classname')).toContain('md:hidden')
    expect(mainTimer.getAttribute('data-classname')).toContain('hidden')
    expect(mainTimer.getAttribute('data-classname')).toContain('md:inline')
  })

  // ---- Discovery (browse-only) mode ----------------------------------------

  // Every question rides in pre-answered with its correct option, so the runner
  // opens in review state: correct option green, no attempt step, nothing scored.
  const DISCOVERY_ANSWERS = {
    q1: { selectedOptionId: 'a', responseTimeMs: 0 },
    q2: { selectedOptionId: 'c', responseTimeMs: 0 },
    q3: { selectedOptionId: 'e', responseTimeMs: 0 },
  }
  const DISCOVERY_FEEDBACK = new Map([
    ['q1', mcFeedback('a')],
    ['q2', mcFeedback('c')],
    ['q3', mcFeedback('e')],
  ])

  function renderDiscovery() {
    return render(
      <QuizSession
        sessionId="disc-1"
        questions={QUESTIONS}
        userId="test-user-id"
        mode="discovery"
        initialAnswers={DISCOVERY_ANSWERS}
        initialFeedback={DISCOVERY_FEEDBACK}
      />,
    )
  }

  it('pre-marks the correct option in discovery mode', () => {
    renderDiscovery()
    // No click — the option is pre-selected from the handoff and painted as correct.
    expect(screen.getByTestId('option-a').dataset.selected).toBe('true')
    expect(screen.getByTestId('option-a').dataset.correct).toBe('true')
  })

  it('never calls the check-answer action in discovery mode', () => {
    renderDiscovery()
    // Clicking the pre-selected correct option AND an unselected wrong option are both
    // inert — the pre-answered guard keys on the question, not the chosen option.
    fireEvent.click(screen.getByTestId('option-a'))
    fireEvent.click(screen.getByTestId('option-b'))
    expect(mockCheckAnswer).not.toHaveBeenCalled()
    // The clicks are visually inert too: the pre-marked correct option stays
    // selected+correct and the wrong option never becomes selected.
    expect(screen.getByTestId('option-a').dataset.selected).toBe('true')
    expect(screen.getByTestId('option-a').dataset.correct).toBe('true')
    expect(screen.getByTestId('option-b').dataset.selected).not.toBe('true')
  })

  it('shows no submit affordance in discovery mode', () => {
    renderDiscovery()
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit quiz/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
  })

  it('shows Exit (not Finish) in the header and navigates to /app/quiz on click', async () => {
    renderDiscovery()
    expect(screen.queryByRole('button', { name: /finish/i })).not.toBeInTheDocument()
    const exitBtn = screen.getByRole('button', { name: 'Exit' })
    fireEvent.click(exitBtn)
    // Exit awaits the discovery teardown before navigating (§6), so await the nav.
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz'))
  })

  it('lifecycle: opens pre-marked, allows navigation, and exits to /app/quiz', async () => {
    renderDiscovery()
    // Entry: first question opens in reviewed state (correct option pre-selected)
    expect(screen.getByTestId('option-a').dataset.selected).toBe('true')
    expect(screen.getByTestId('option-a').dataset.correct).toBe('true')
    // No scoring affordances present
    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
    // Navigate to next question
    fireEvent.click(screen.getAllByRole('button', { name: /Next/ })[0]!)
    expect(screen.getByTestId('option-c').dataset.selected).toBe('true')
    expect(screen.getByTestId('option-c').dataset.correct).toBe('true')
    // Exit navigates away — the only way to leave discovery
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz'))
  })
})
