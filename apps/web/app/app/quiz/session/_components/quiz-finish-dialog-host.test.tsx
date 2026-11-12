import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'

vi.mock('../../_components/finish-quiz-dialog', () => ({
  FinishQuizDialog: ({
    open,
    isExam,
    examMode,
    pendingSelection,
  }: {
    open: boolean
    isExam?: boolean
    examMode?: string
    pendingSelection?: boolean
  }) => (
    <div
      data-testid="finish-dialog"
      data-pending={String(!!pendingSelection)}
      data-open={String(open)}
      data-is-exam={isExam ? 'true' : 'false'}
      data-exam-mode={examMode ?? ''}
    />
  ),
}))

vi.mock('./discovery-leave-dialog', () => ({
  DiscoveryLeaveDialog: ({ open }: { open: boolean }) => (
    <div data-testid="discovery-leave" data-open={String(open)} />
  ),
}))

import { QuizFinishDialogHost } from './quiz-finish-dialog-host'

function makeState(overrides: Partial<QuizState> = {}): QuizState {
  return {
    answeredCount: 0,
    submitting: false,
    pendingAction: undefined,
    error: null,
    handleSubmit: vi.fn(),
    setShowFinishDialog: vi.fn(),
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
    showFinishDialog: true,
    isExam: false,
    ...overrides,
  } as unknown as QuizState
}

describe('QuizFinishDialogHost', () => {
  it('renders the finish dialog for a study session', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ isExam: false })}
        isDiscovery={false}
        totalQuestions={3}
        timeExpired={false}
        takenOver={false}
        pendingSelection
        discoveryConfirmOpen={false}
        onDiscoveryConfirmChange={vi.fn()}
      />,
    )
    const dialog = screen.getByTestId('finish-dialog')
    expect(dialog).toHaveAttribute('data-pending', 'true')
    expect(dialog).toHaveAttribute('data-is-exam', 'false')
    expect(dialog).toHaveAttribute('data-exam-mode', '')
  })

  it('renders the finish dialog for an exam session and defaults examMode to mock_exam', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ isExam: true })}
        isDiscovery={false}
        totalQuestions={3}
        timeExpired={false}
        takenOver={false}
      />,
    )
    const dialog = screen.getByTestId('finish-dialog')
    expect(dialog).toHaveAttribute('data-is-exam', 'true')
    expect(dialog).toHaveAttribute('data-exam-mode', 'mock_exam')
  })

  it('passes through an explicit examMode for an exam session', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ isExam: true })}
        isDiscovery={false}
        totalQuestions={3}
        examMode="internal_exam"
        timeExpired={false}
        takenOver={false}
      />,
    )
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-exam-mode', 'internal_exam')
  })

  it('closes the finish dialog while the session is taken over', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ showFinishDialog: true })}
        isDiscovery={false}
        totalQuestions={3}
        timeExpired={false}
        takenOver
      />,
    )
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-open', 'false')
  })

  it('opens the finish dialog when it is requested and the session is not taken over', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ showFinishDialog: true })}
        isDiscovery={false}
        totalQuestions={3}
        timeExpired={false}
        takenOver={false}
      />,
    )
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('opens the dialog the timer requested once the takeover flag clears', () => {
    const s = makeState({ showFinishDialog: true })
    const props = { s, isDiscovery: false, totalQuestions: 3, timeExpired: true }
    const { rerender } = render(<QuizFinishDialogHost {...props} takenOver />)
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-open', 'false')
    rerender(<QuizFinishDialogHost {...props} takenOver={false} />)
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-open', 'true')
  })

  it('renders the Stay/Leave confirm, not the finish dialog, in discovery mode', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ isExam: false })}
        isDiscovery={true}
        totalQuestions={3}
        timeExpired={false}
        takenOver={false}
        discoveryConfirmOpen
        onDiscoveryConfirmChange={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('discovery-leave')).toHaveAttribute('data-open', 'true')
  })
})
