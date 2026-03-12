import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockSessionRunner = vi.fn()

vi.mock('@/app/app/_components/session-runner', () => ({
  SessionRunner: (props: Record<string, unknown>) => {
    mockSessionRunner(props)
    return <div data-testid="session-runner" />
  },
}))

vi.mock('../../actions', () => ({
  submitReviewAnswer: vi.fn(),
  completeReviewSession: vi.fn(),
}))

import { completeReviewSession, submitReviewAnswer } from '../../actions'
import { ReviewSession } from './review-session'

const QUESTIONS = [
  {
    id: 'q1',
    question_text: 'What causes turbulence?',
    question_image_url: null,
    question_number: null,
    options: [{ id: 'a', text: 'Wind shear' }],
  },
]

describe('ReviewSession', () => {
  it('renders SessionRunner with review mode and actions', () => {
    render(<ReviewSession sessionId="sess-1" questions={QUESTIONS} />)
    expect(screen.getByTestId('session-runner')).toBeInTheDocument()
    expect(mockSessionRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        questions: QUESTIONS,
        mode: 'smart_review',
        onSubmitAnswer: submitReviewAnswer,
        onComplete: completeReviewSession,
      }),
    )
  })
})
