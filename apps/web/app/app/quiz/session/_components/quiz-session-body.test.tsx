import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizSessionProps } from '../../session-types'
import type { useQuizSession } from '../_hooks/use-quiz-session'
import { QuizSessionBody } from './quiz-session-body'

vi.mock('../../_components/question-tabs', () => ({
  QuestionTabs: () => <div data-testid="question-tabs" />,
}))
vi.mock('./quiz-question-card', () => ({
  QuizQuestionCard: () => <div data-testid="question-card" />,
}))
vi.mock('./quiz-session-grid', () => ({
  QuizSessionGrid: () => <div data-testid="session-grid" />,
}))

type Session = ReturnType<typeof useQuizSession>

function makeSession(isExam: boolean): Session {
  return {
    s: { isExam, questionId: 'q1' },
    isDiscovery: false,
    ui: {
      activeTab: 'question',
      effectiveTab: 'question',
      setActiveTab: vi.fn(),
      pendingOptionId: null,
      handleSelectionChange: vi.fn(),
      feedbackMap: {},
    },
    flags: {
      isFlagged: vi.fn(() => false),
      isToggling: vi.fn(() => false),
      toggleFlag: vi.fn(),
      flaggedIds: [],
    },
    highlightedOptionId: null,
  } as unknown as Session
}

const props = { questions: [{ id: 'q1' }], userId: 'u1' } as unknown as QuizSessionProps

describe('QuizSessionBody', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })
  afterEach(cleanup)

  it('renders question tabs in study mode', () => {
    render(<QuizSessionBody props={props} session={makeSession(false)} />)
    expect(screen.getByTestId('question-tabs')).toBeTruthy()
    expect(screen.getByTestId('question-card')).toBeTruthy()
    expect(screen.getByTestId('session-grid')).toBeTruthy()
  })

  it('hides question tabs in exam mode', () => {
    render(<QuizSessionBody props={props} session={makeSession(true)} />)
    expect(screen.queryByTestId('question-tabs')).toBeNull()
    expect(screen.getByTestId('question-card')).toBeTruthy()
  })
})
