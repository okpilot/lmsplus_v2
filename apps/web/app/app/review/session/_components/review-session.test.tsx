import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewSession } from './review-session'

const mockSubmitReviewAnswer = vi.fn()
const mockCompleteReviewSession = vi.fn()

vi.mock('../../actions', () => ({
  submitReviewAnswer: (...args: unknown[]) => mockSubmitReviewAnswer(...args),
  completeReviewSession: (...args: unknown[]) => mockCompleteReviewSession(...args),
}))

const QUESTIONS = [
  {
    id: 'q1',
    question_text: 'What causes turbulence?',
    question_image_url: null,
    question_number: null,
    options: [
      { id: 'a', text: 'Wind shear' },
      { id: 'b', text: 'Gravity' },
    ],
  },
  {
    id: 'q2',
    question_text: 'What is METAR?',
    question_image_url: null,
    question_number: null,
    options: [
      { id: 'c', text: 'Weather report' },
      { id: 'd', text: 'Flight plan' },
    ],
  },
]

describe('ReviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the first question', () => {
    render(<ReviewSession sessionId="sess-1" questions={QUESTIONS} />)
    expect(screen.getByText('What causes turbulence?')).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
  })

  it('submits an answer and shows feedback', async () => {
    const user = userEvent.setup()
    mockSubmitReviewAnswer.mockResolvedValue({
      success: true,
      isCorrect: false,
      correctOptionId: 'a',
      explanationText: 'Wind shear is the main cause.',
      explanationImageUrl: null,
    })

    render(<ReviewSession sessionId="sess-1" questions={QUESTIONS} />)
    await user.click(screen.getByText('Gravity'))
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }))

    await waitFor(() => {
      expect(screen.getByText('Wind shear is the main cause.')).toBeInTheDocument()
    })
    expect(mockSubmitReviewAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        questionId: 'q1',
        selectedOptionId: 'b',
      }),
    )
  })

  it('advances to the next question after feedback', async () => {
    const user = userEvent.setup()
    mockSubmitReviewAnswer.mockResolvedValue({
      success: true,
      isCorrect: true,
      correctOptionId: 'a',
      explanationText: 'Right!',
      explanationImageUrl: null,
    })

    render(<ReviewSession sessionId="sess-1" questions={QUESTIONS} />)
    await user.click(screen.getByText('Wind shear'))
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }))
    await waitFor(() => expect(screen.getByText('Right!')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Next Question/ }))
    expect(screen.getByText('What is METAR?')).toBeInTheDocument()
  })

  it('shows session summary after completing all questions', async () => {
    const user = userEvent.setup()
    mockSubmitReviewAnswer.mockResolvedValue({
      success: true,
      isCorrect: true,
      correctOptionId: 'a',
      explanationText: 'Wind shear causes unstable air.',
      explanationImageUrl: null,
    })
    mockCompleteReviewSession.mockResolvedValue({
      success: true,
      correctCount: 1,
      scorePercentage: 100,
    })

    // QUESTIONS[0] is guaranteed to exist in this test's fixture data
    const singleQ = [QUESTIONS[0]!]
    render(<ReviewSession sessionId="sess-1" questions={singleQ} />)

    await user.click(screen.getByText('Wind shear'))
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }))
    await waitFor(() =>
      expect(screen.getByText('Wind shear causes unstable air.')).toBeInTheDocument(),
    )

    await user.click(screen.getByRole('button', { name: /Next Question/ }))

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
    expect(mockCompleteReviewSession).toHaveBeenCalledWith({ sessionId: 'sess-1' })
  })

  it('shows an error when answer submission fails', async () => {
    const user = userEvent.setup()
    mockSubmitReviewAnswer.mockResolvedValue({
      success: false,
      error: 'Network error',
    })

    render(<ReviewSession sessionId="sess-1" questions={QUESTIONS} />)
    await user.click(screen.getByText('Wind shear'))
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('shows an error when session completion fails', async () => {
    const user = userEvent.setup()
    mockSubmitReviewAnswer.mockResolvedValue({
      success: true,
      isCorrect: true,
      correctOptionId: 'a',
      explanationText: 'Wind shear is the correct cause.',
      explanationImageUrl: null,
    })
    mockCompleteReviewSession.mockResolvedValue({
      success: false,
      error: 'Session expired',
    })

    const singleQ = [QUESTIONS[0]!]
    render(<ReviewSession sessionId="sess-1" questions={singleQ} />)
    await user.click(screen.getByText('Wind shear'))
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }))
    await waitFor(() =>
      expect(screen.getByText('Wind shear is the correct cause.')).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: /Next Question/ }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('returns null when questions array is empty', () => {
    const { container } = render(<ReviewSession sessionId="sess-1" questions={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
