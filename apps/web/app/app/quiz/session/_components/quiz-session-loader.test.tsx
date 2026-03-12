import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockLoadSessionQuestions } = vi.hoisted(() => ({
  mockLoadSessionQuestions: vi.fn(),
}))

const mockRouterReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}))

vi.mock('@/lib/queries/load-session-questions', () => ({
  loadSessionQuestions: mockLoadSessionQuestions,
}))

vi.mock('./quiz-session', () => ({
  QuizSession: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="quiz-session">{sessionId}</div>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import { QuizSessionLoader } from './quiz-session-loader'

// ---- Fixtures -------------------------------------------------------------

const SESSION_DATA = { sessionId: 'session-abc', questionIds: ['q1', 'q2'] }

const QUESTIONS = [
  { id: 'q1', question_text: 'What is VFR?', question_image_url: null, options: [] },
  { id: 'q2', question_text: 'What is IFR?', question_image_url: null, options: [] },
]

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('QuizSessionLoader', () => {
  // NOTE: This test must run first — the module-level cachedSession starts as null
  // only when the module is freshly loaded. Subsequent tests that set session data
  // will populate the cache, so the "no data" scenario relies on fresh module state.
  it('redirects to /app/quiz when no session data exists in storage', async () => {
    render(<QuizSessionLoader />)
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
    })
  })

  it('shows loading skeletons while questions are being fetched', () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    // Return a promise that never resolves so we can observe the loading state
    mockLoadSessionQuestions.mockReturnValue(new Promise(() => {}))

    const { container } = render(<QuizSessionLoader />)

    // Skeleton elements have the animate-pulse class
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows an error message when loadSessionQuestions fails', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: false, error: 'RPC call failed' })

    render(<QuizSessionLoader />)

    await waitFor(() => {
      expect(screen.getByText('RPC call failed')).toBeInTheDocument()
    })
  })

  it('renders QuizSession with the session ID when questions load successfully', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })
    expect(screen.getByText('session-abc')).toBeInTheDocument()
  })

  it('removes quiz-session from sessionStorage after reading it', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })
    expect(sessionStorage.getItem('quiz-session')).toBeNull()
  })

  it('passes the correct question IDs to loadSessionQuestions', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader />)

    await waitFor(() => {
      expect(mockLoadSessionQuestions).toHaveBeenCalledWith(['q1', 'q2'])
    })
  })
})
