import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizQuestionCard } from './quiz-question-card'

vi.mock('./quiz-card-header', () => ({ QuizCardHeader: () => <div data-testid="header" /> }))
vi.mock('./quiz-main-panel', () => ({ QuizMainPanel: () => <div data-testid="panel" /> }))

const navigate = vi.fn()
const handleSelectAnswer = vi.fn()

function makeState(overrides: Record<string, unknown> = {}): QuizState {
  return {
    currentIndex: 0,
    isExam: false,
    isPinned: false,
    togglePin: vi.fn(),
    answering: false,
    existingAnswer: undefined,
    question: { question_type: 'multiple_choice', question_number: '1' },
    navigate,
    handleSelectAnswer,
    ...overrides,
  } as unknown as QuizState
}

function renderCard(
  s: QuizState,
  opts: { activeTab?: 'question' | 'explanation'; pendingOptionId?: string | null } = {},
) {
  return render(
    <QuizQuestionCard
      s={s}
      activeTab={opts.activeTab ?? 'question'}
      userId="u1"
      totalQuestions={3}
      isFlagged={false}
      flagLoading={false}
      onToggleFlag={vi.fn()}
      pendingOptionId={opts.pendingOptionId ?? null}
      onSelectionChange={vi.fn()}
      keyboardHighlightedId={null}
    />,
  )
}

describe('QuizQuestionCard action slot', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows Submit with a ghost Next for an unanswered multiple-choice question', () => {
    renderCard(makeState())
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).not.toHaveClass('bg-primary')
  })

  it('keeps Submit mounted while the answer is in flight even once existingAnswer is set', () => {
    renderCard(makeState({ answering: true, existingAnswer: { selected: 'a' } }))
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeDisabled()
  })

  it('shows a primary Next and no Submit once answered', () => {
    renderCard(makeState({ existingAnswer: { selected: 'a' } }))
    expect(screen.getByRole('button', { name: /next/i })).toHaveClass('bg-primary')
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('shows only a ghost Next off the question tab', () => {
    renderCard(makeState(), { activeTab: 'explanation' })
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
    expect(screen.getByRole('button', { name: /next/i })).not.toHaveClass('bg-primary')
  })

  it('shows only a ghost Next for non-multiple-choice questions', () => {
    renderCard(makeState({ question: { question_type: 'short_answer', question_number: '1' } }))
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
    expect(screen.getByRole('button', { name: /next/i })).not.toHaveClass('bg-primary')
  })

  it('submits the pending option and navigates with Next/Previous', () => {
    renderCard(makeState({ currentIndex: 1 }), { pendingOptionId: 'opt-b' })
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }))
    expect(handleSelectAnswer).toHaveBeenCalledWith('opt-b')
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(navigate).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(navigate).toHaveBeenCalledWith(-1)
  })
})
