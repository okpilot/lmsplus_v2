import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockState } = vi.hoisted(() => ({ mockState: vi.fn() }))

vi.mock('../_hooks/use-quiz-state', () => ({ useQuizState: (...a: unknown[]) => mockState(...a) }))
vi.mock('../_hooks/use-flagged-questions', () => ({
  useFlaggedQuestions: () => ({
    flaggedIds: new Set<string>(),
    isFlagged: () => false,
    toggleFlag: vi.fn(),
    isToggling: () => false,
  }),
}))
vi.mock('../_hooks/use-quiz-timer', () => ({
  useQuizTimer: () => ({ timerStart: 1, timeExpired: false, handleTimeExpired: vi.fn() }),
}))
vi.mock('../_hooks/use-quiz-navigation-guard', () => ({ useQuizNavigationGuard: vi.fn() }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./quiz-session-grid', () => ({ QuizSessionGrid: () => null }))
vi.mock('./quiz-session-meta-row', () => ({ QuizSessionMetaRow: () => null }))
vi.mock('./quiz-main-panel', () => ({ QuizMainPanel: () => null }))
vi.mock('./quiz-session-footer', () => ({ QuizSessionFooter: () => null }))
vi.mock('./quiz-session-header', () => ({
  QuizSessionHeader: ({ onExitClick }: Readonly<{ onExitClick: () => void }>) => (
    <button type="button" onClick={onExitClick}>
      Exit
    </button>
  ),
}))
vi.mock('./quiz-finish-dialog-host', () => ({
  QuizFinishDialogHost: ({ discoveryConfirmOpen }: Readonly<{ discoveryConfirmOpen: boolean }>) =>
    discoveryConfirmOpen ? <div role="alertdialog">Leave discovery?</div> : null,
}))

import { QuizSession } from './quiz-session'

const QUESTION = { id: 'q1', options: [{ id: 'a' }, { id: 'b' }], question_number: null }

function state() {
  return {
    isExam: false,
    currentIndex: 0,
    seenIndices: new Set<number>(),
    question: QUESTION,
    questionId: 'q1',
    questionIds: ['q1', 'q2'],
    answeredIds: new Set<string>(),
    pinnedQuestions: new Set<string>(),
    feedback: new Map(),
    existingAnswer: undefined,
    submitted: { current: false },
    showFinishDialog: false,
    setShowFinishDialog: vi.fn(),
    navigate: vi.fn(),
    navigateTo: vi.fn(),
    handleSelectAnswer: vi.fn(),
    answering: false,
    submitting: false,
  }
}

function renderDiscovery() {
  return render(
    <QuizSession
      userId="u1"
      sessionId="s1"
      questions={[QUESTION, { id: 'q2', options: [] }] as never}
      mode="discovery"
    />,
  )
}

let s: ReturnType<typeof state>

beforeEach(() => {
  vi.resetAllMocks()
  s = state()
  mockState.mockReturnValue(s)
})

describe('QuizSession — keyboard shortcuts around the Discovery leave dialog', () => {
  it('navigates with the arrow keys while the leave dialog is closed', () => {
    renderDiscovery()

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(s.navigate).toHaveBeenCalledWith(1)
  })

  it('does not navigate with the arrow keys while the leave dialog is open', () => {
    renderDiscovery()
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(s.navigate).not.toHaveBeenCalled()
  })

  it('does not answer the highlighted option on Enter while the leave dialog is open', () => {
    renderDiscovery()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))

    fireEvent.keyDown(window, { key: 'Enter' })

    expect(s.handleSelectAnswer).not.toHaveBeenCalled()
  })
})
