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
  submitQuizAnswer: vi.fn(),
  completeQuiz: vi.fn(),
}))

import { completeQuiz, submitQuizAnswer } from '../../actions'
import { QuizSession } from './quiz-session'

const QUESTIONS = [
  {
    id: 'q1',
    question_text: 'What is lift?',
    question_image_url: null,
    question_number: null,
    options: [{ id: 'a', text: 'A force' }],
  },
]

describe('QuizSession', () => {
  it('renders SessionRunner with quiz mode and actions', () => {
    render(<QuizSession sessionId="sess-1" questions={QUESTIONS} />)
    expect(screen.getByTestId('session-runner')).toBeInTheDocument()
    expect(mockSessionRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        questions: QUESTIONS,
        mode: 'quick_quiz',
        onSubmitAnswer: submitQuizAnswer,
        onComplete: completeQuiz,
      }),
    )
  })
})
