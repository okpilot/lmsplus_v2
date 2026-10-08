import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FinishQuizDialog } from './finish-quiz-dialog'

function renderDialog(pendingSelection?: boolean) {
  render(
    <FinishQuizDialog
      open
      answeredCount={1}
      totalQuestions={5}
      submitting={false}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      onDiscard={vi.fn()}
      pendingSelection={pendingSelection}
    />,
  )
}

const WARNING = "You picked an answer on this question but haven't submitted it."

describe('FinishQuizDialog pending selection', () => {
  it('warns that the picked option has not been submitted', () => {
    renderDialog(true)
    expect(screen.getByText(WARNING)).toBeInTheDocument()
  })

  it('shows no warning when nothing is picked', () => {
    renderDialog(false)
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('shows no warning when the prop is absent', () => {
    renderDialog()
    expect(screen.queryByText(WARNING)).toBeNull()
  })
})
