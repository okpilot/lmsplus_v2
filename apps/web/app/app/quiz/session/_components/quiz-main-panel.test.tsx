import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'

// ---- Mocks -----------------------------------------------------------------

vi.mock('@/app/app/_components/question-card', () => ({
  QuestionCard: ({ questionText }: { questionText: string }) => (
    <div data-testid="question-card">{questionText}</div>
  ),
}))

vi.mock('@/app/app/_components/answer-options', () => ({
  AnswerOptions: () => <div data-testid="answer-options" />,
}))

vi.mock('@/app/app/_components/session-timer', () => ({
  SessionTimer: ({ className }: { className?: string }) => (
    <span data-testid="session-timer" className={className}>
      00:00
    </span>
  ),
}))

vi.mock('../../_components/question-tabs', () => ({
  QuestionTabs: () => <div data-testid="question-tabs" />,
}))

vi.mock('./quiz-tab-content', () => ({
  QuizTabContent: () => <div data-testid="quiz-tab-content" />,
}))

vi.mock('./quiz-controls', () => ({
  QuizControls: () => <div data-testid="quiz-controls" />,
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
    const { container } = render(
      <QuizMainPanel
        s={s}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the question card with the current question text', () => {
    render(
      <QuizMainPanel
        s={makeState()}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.getByTestId('question-card')).toHaveTextContent('What is lift?')
  })

  it('displays the correct question counter', () => {
    render(
      <QuizMainPanel
        s={makeState({ currentIndex: 1 })}
        totalQuestions={5}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.getByText(/Question 2 of 5/)).toBeInTheDocument()
  })

  it('shows the question number when present', () => {
    render(
      <QuizMainPanel
        s={makeState()}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.getByText('No. 050-01-01-001')).toBeInTheDocument()
  })

  it('omits the question number element when question_number is null', () => {
    const s = makeState({
      question: {
        id: 'q1',
        question_text: 'What is drag?',
        question_image_url: null,
        question_number: null,
        explanation_text: null,
        explanation_image_url: null,
        options: [],
      },
    })
    render(
      <QuizMainPanel
        s={s}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.queryByText(/^No\./)).not.toBeInTheDocument()
  })

  it('renders the session timer', () => {
    render(
      <QuizMainPanel
        s={makeState()}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.getByTestId('session-timer')).toBeInTheDocument()
  })

  it('shows progress bar at correct width for answered questions', () => {
    const s = makeState({ answeredCount: 2 })
    render(
      <QuizMainPanel
        s={s}
        totalQuestions={4}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    const bar = screen.getByTestId('progress-bar')
    expect(bar).toHaveStyle({ width: '50%' })
  })

  it('shows progress bar at 0% when no questions answered', () => {
    render(
      <QuizMainPanel
        s={makeState({ answeredCount: 0 })}
        totalQuestions={5}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    const bar = screen.getByTestId('progress-bar')
    expect(bar).toHaveStyle({ width: '0%' })
  })

  it('shows progress bar at 100% when all questions answered', () => {
    render(
      <QuizMainPanel
        s={makeState({ answeredCount: 3 })}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    const bar = screen.getByTestId('progress-bar')
    expect(bar).toHaveStyle({ width: '100%' })
  })

  it('shows answered count fraction next to progress bar', () => {
    render(
      <QuizMainPanel
        s={makeState({ answeredCount: 2 })}
        totalQuestions={5}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('shows error alert when s.error is set', () => {
    const s = makeState({ error: 'Something went wrong' })
    render(
      <QuizMainPanel
        s={s}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  })

  it('does not render error alert when s.error is null', () => {
    render(
      <QuizMainPanel
        s={makeState({ error: null })}
        totalQuestions={3}
        activeTab="question"
        onTabChange={vi.fn()}
        userId="test-user-id"
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
