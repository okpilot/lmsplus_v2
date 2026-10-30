import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionQuestion } from '../_types/session'
import { ActiveSession } from './active-session'

vi.mock('./question-card', () => ({ QuestionCard: () => <div data-testid="question-card" /> }))
vi.mock('./session-progress-bar', () => ({
  SessionProgressBar: () => <div data-testid="progress-bar" />,
}))

function question(id: string, optionText: string) {
  return {
    id,
    question_text: `${id}?`,
    question_image_url: null,
    question_number: null,
    options: [{ id: `${id}-a`, text: optionText }],
  } as unknown as SessionQuestion
}

const Q1 = question('q1', 'First answer')
const Q2 = question('q2', 'Second answer')

function view(q: SessionQuestion, onSubmit = vi.fn()) {
  return (
    <ActiveSession
      question={q}
      questions={[Q1, Q2]}
      currentIndex={q === Q1 ? 0 : 1}
      submitting={false}
      error={null}
      feedback={null}
      selectedOption={null}
      state="answering"
      onSubmit={onSubmit}
      onNext={vi.fn()}
    />
  )
}

describe('ActiveSession across questions', () => {
  it('does not carry a picked option over to the next question', () => {
    const onSubmit = vi.fn()
    const { rerender } = render(view(Q1, onSubmit))
    fireEvent.click(screen.getByText('First answer'))
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeEnabled()

    rerender(view(Q2, onSubmit))

    const submit = screen.getByRole('button', { name: 'Submit Answer' })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
