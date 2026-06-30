import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'

vi.mock('../../_components/finish-quiz-dialog', () => ({
  FinishQuizDialog: ({
    open,
    isExam,
    examMode,
  }: {
    open: boolean
    isExam?: boolean
    examMode?: string
  }) => (
    <div
      data-testid="finish-dialog"
      data-open={String(open)}
      data-is-exam={isExam ? 'true' : 'false'}
      data-exam-mode={examMode ?? ''}
    />
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
      />,
    )
    const dialog = screen.getByTestId('finish-dialog')
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
      />,
    )
    expect(screen.getByTestId('finish-dialog')).toHaveAttribute('data-exam-mode', 'internal_exam')
  })

  it('renders nothing in discovery mode', () => {
    render(
      <QuizFinishDialogHost
        s={makeState({ isExam: false })}
        isDiscovery={true}
        totalQuestions={3}
        timeExpired={false}
      />,
    )
    expect(screen.queryByTestId('finish-dialog')).not.toBeInTheDocument()
  })
})
