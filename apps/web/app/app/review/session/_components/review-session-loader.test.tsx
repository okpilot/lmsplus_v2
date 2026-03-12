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

vi.mock('./review-session', () => ({
  ReviewSession: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="review-session">{sessionId}</div>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import { ReviewSessionLoader } from './review-session-loader'

// ---- Fixtures -------------------------------------------------------------

const SESSION_DATA = { sessionId: 'review-xyz', questionIds: ['q10', 'q11'] }

const QUESTIONS = [
  { id: 'q10', question_text: 'Describe circuit breakers.', question_image_url: null, options: [] },
  { id: 'q11', question_text: 'Define MTOW.', question_image_url: null, options: [] },
]

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('ReviewSessionLoader', () => {
  // NOTE: This test must run first — the module-level cachedSession starts as null
  // only when the module is freshly loaded. Later tests that set session data
  // populate the cache, so the "no data" case relies on a clean module start.
  it('redirects to /app/review when no session data exists in storage', async () => {
    render(<ReviewSessionLoader />)
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/app/review')
    })
  })

  it('shows loading skeletons while questions are being fetched', () => {
    sessionStorage.setItem('review-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockReturnValue(new Promise(() => {}))

    const { container } = render(<ReviewSessionLoader />)

    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows an error message when loadSessionQuestions fails', async () => {
    sessionStorage.setItem('review-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: false, error: 'DB connection error' })

    render(<ReviewSessionLoader />)

    await waitFor(() => {
      expect(screen.getByText('DB connection error')).toBeInTheDocument()
    })
  })

  it('renders ReviewSession with the session ID when questions load successfully', async () => {
    sessionStorage.setItem('review-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<ReviewSessionLoader />)

    await waitFor(() => {
      expect(screen.getByTestId('review-session')).toBeInTheDocument()
    })
    expect(screen.getByText('review-xyz')).toBeInTheDocument()
  })

  it('removes review-session from sessionStorage after reading it', async () => {
    sessionStorage.setItem('review-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<ReviewSessionLoader />)

    await waitFor(() => {
      expect(screen.getByTestId('review-session')).toBeInTheDocument()
    })
    expect(sessionStorage.getItem('review-session')).toBeNull()
  })

  it('passes the correct question IDs to loadSessionQuestions', async () => {
    sessionStorage.setItem('review-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<ReviewSessionLoader />)

    await waitFor(() => {
      expect(mockLoadSessionQuestions).toHaveBeenCalledWith(['q10', 'q11'])
    })
  })
})
