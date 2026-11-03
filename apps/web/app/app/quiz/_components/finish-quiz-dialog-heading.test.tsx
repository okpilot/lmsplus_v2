import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FinishQuizDialog } from './finish-quiz-dialog'

describe('FinishQuizDialog heading', () => {
  it('titles the dialog with a level-2 heading from the shared heading part', () => {
    render(
      <FinishQuizDialog
        open
        answeredCount={3}
        totalQuestions={5}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent(/finish quiz/i)
    expect(heading.className).toContain('text-heading')
  })
})
