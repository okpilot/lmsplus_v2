import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockState, seen } = vi.hoisted(() => ({
  mockState: vi.fn(),
  seen: {} as Record<string, Record<string, unknown>>,
}))

vi.mock('../_hooks/use-quiz-state', () => ({ useQuizState: (...a: unknown[]) => mockState(...a) }))
vi.mock('../_hooks/use-flagged-questions', () => ({
  useFlaggedQuestions: () => ({
    flaggedIds: new Set<string>(),
    isFlagged: () => false,
    toggleFlag: vi.fn(),
    isToggling: () => false,
  }),
}))
vi.mock('../_hooks/use-quiz-active-tab', () => ({
  useQuizActiveTab: () => ({ activeTab: 'question', setActiveTab: vi.fn() }),
}))
vi.mock('../_hooks/use-quiz-ui', () => ({
  useQuizUI: () => ({
    feedbackMap: new Map(),
    pendingOptionId: null,
    handleSelectionChange: vi.fn(),
    canSubmitAnswer: false,
  }),
}))
vi.mock('../_hooks/use-quiz-timer', () => ({
  useQuizTimer: () => ({ timerStart: 1, timeExpired: false, handleTimeExpired: vi.fn() }),
}))
vi.mock('../_hooks/use-unblocked-quiz-keyboard', () => ({
  useUnblockedQuizKeyboard: () => ({ highlightedOptionId: null }),
}))
function spy(name: string) {
  return (p: Record<string, unknown>) => {
    seen[name] = p
    return null
  }
}
vi.mock('../../_components/question-grid', () => ({ QuestionGrid: spy('grid') }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./quiz-session-header', () => ({ QuizSessionHeader: spy('header') }))
vi.mock('./quiz-session-meta-row', () => ({ QuizSessionMetaRow: spy('meta') }))
vi.mock('./quiz-main-panel', () => ({ QuizMainPanel: () => null }))
vi.mock('./quiz-session-footer', () => ({ QuizSessionFooter: () => null }))
vi.mock('./quiz-finish-dialog-host', () => ({ QuizFinishDialogHost: () => null }))

import { QuizSession } from './quiz-session'

const QUESTIONS = [
  { id: 'q1', options: [], question_number: null },
  { id: 'q2', options: [] },
]

function state(over: Record<string, unknown> = {}) {
  return {
    isExam: false,
    currentIndex: 0,
    seenIndices: new Set<number>(),
    question: QUESTIONS[0],
    questionId: 'q1',
    questionIds: ['q1', 'q2'],
    answeredIds: new Set(['q2']),
    pinnedQuestions: new Set<string>(),
    feedback: new Map(),
    existingAnswer: undefined,
    showFinishDialog: false,
    setShowFinishDialog: vi.fn(),
    navigate: vi.fn(),
    navigateTo: vi.fn(),
    handleSelectAnswer: vi.fn(),
    answering: false,
    submitting: false,
    ...over,
  }
}

function renderIt(props: Record<string, unknown> = {}) {
  return render(
    <QuizSession
      userId="u1"
      sessionId="s1"
      questions={QUESTIONS as never}
      initialPinnedIds={['q2']}
      initialActiveMs={42_000}
      mode="study"
      {...props}
    />,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const k of Object.keys(seen)) delete seen[k]
  mockState.mockReturnValue(state())
})

describe('QuizSession — resumed from the server', () => {
  it('hands the saved pins and active time to the quiz state', () => {
    renderIt()

    expect(mockState).toHaveBeenCalledWith(
      expect.objectContaining({ initialPinnedIds: ['q2'], initialActiveMs: 42_000 }),
    )
  })

  it('starts the untimed clock from the active time already spent', () => {
    renderIt()

    expect(seen.header?.initialActiveMs).toBe(42_000)
    expect(seen.meta?.initialActiveMs).toBe(42_000)
  })

  it('tells the question grid which practice questions are answered', () => {
    renderIt()

    expect(seen.grid?.answeredIds).toEqual(new Set(['q2']))
    expect(seen.grid?.isExamMode).toBe(false)
  })

  it('leaves answered squares to the visited colouring in Discovery', () => {
    mockState.mockReturnValue(state({ seenIndices: new Set([1]) }))
    renderIt({ mode: 'discovery' })

    expect(seen.grid?.answeredIds).toBeUndefined()
    expect(seen.grid?.seenIds).toEqual(new Set([1]))
  })
})
