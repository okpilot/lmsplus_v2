import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionQuestion } from '../_types/session'
import { ActiveSession } from './active-session'

vi.mock('./question-card', () => ({ QuestionCard: () => <div data-testid="question-card" /> }))
vi.mock('./session-answer-block', () => ({
  SessionAnswerBlock: () => <div data-testid="answer-block" />,
}))
vi.mock('./session-progress-bar', () => ({
  SessionProgressBar: () => <div data-testid="progress-bar" />,
}))

const QUESTION = {
  id: 'q1',
  question_text: 'Q?',
  question_image_url: null,
  question_number: null,
  options: [],
} as unknown as SessionQuestion

function renderSession(error: string | null) {
  return render(
    <ActiveSession
      question={QUESTION}
      questions={[QUESTION]}
      currentIndex={0}
      submitting={false}
      error={error}
      feedback={null}
      selectedOption={null}
      state="answering"
      onSubmit={vi.fn()}
      onNext={vi.fn()}
    />,
  )
}

describe('ActiveSession', () => {
  it('shows the session error in a danger alert', () => {
    renderSession('Could not save')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'alert')
    expect(alert).toHaveClass('bg-danger-soft')
    expect(alert).toHaveTextContent('Could not save')
  })

  it('renders no alert when there is no error', () => {
    renderSession(null)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
