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

const { mockReadActiveSession, mockClearActiveSession } = vi.hoisted(() => ({
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
}))

vi.mock('../_utils/quiz-session-storage', () => ({
  readActiveSession: () => mockReadActiveSession(),
  clearActiveSession: mockClearActiveSession,
}))

vi.mock('../../actions/discard', () => ({
  discardQuiz: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../../actions/draft', () => ({
  saveDraft: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../_hooks/use-session-recovery', () => ({
  useSessionRecovery: () => ({
    loading: false,
    error: null,
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
  }),
}))

vi.mock('./session-recovery-prompt', () => ({
  SessionRecoveryPrompt: () => <div data-testid="recovery-prompt" />,
}))

vi.mock('./quiz-session', () => ({
  QuizSession: ({
    sessionId,
    initialIndex,
    initialAnswers,
  }: {
    sessionId: string
    initialIndex?: number
    initialAnswers?: Record<string, unknown>
  }) => (
    <div
      data-testid="quiz-session"
      data-initial-index={initialIndex}
      data-answer-keys={initialAnswers ? Object.keys(initialAnswers).join(',') : ''}
    >
      {sessionId}
    </div>
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

const RECOVERY_SESSION = {
  userId: 'test-user-id',
  sessionId: 'recovery-sess',
  questionIds: ['q1', 'q2'],
  answers: { q1: { selectedOptionId: 'opt-a', responseTimeMs: 1000 } },
  currentIndex: 1,
  subjectName: 'Meteorology',
  subjectCode: 'MET',
  savedAt: Date.now(),
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mockReadActiveSession.mockReturnValue(null)
})

describe('QuizSessionLoader', () => {
  // NOTE: This test must run first — the module-level cachedSession starts as null
  // only when the module is freshly loaded. Subsequent tests that set session data
  // will populate the cache, so the "no data" scenario relies on fresh module state.
  it('redirects to /app/quiz when no session data exists in storage', async () => {
    render(<QuizSessionLoader userId="test-user-id" />)
    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith('/app/quiz')
    })
  })

  it('shows the recovery prompt when no sessionStorage data but localStorage has a session', async () => {
    // sessionStorage is empty, but localStorage has a recoverable session.
    // This test must run before any test that populates cachedSession (module-level cache),
    // otherwise the loader will use the cached value instead of entering the recovery path.
    mockReadActiveSession.mockReturnValue(RECOVERY_SESSION)

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('recovery-prompt')).toBeInTheDocument()
    })
    // Must NOT redirect to /app/quiz
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('shows loading skeletons while questions are being fetched', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    // Return a deferred promise so we can observe the loading state, then resolve to prevent worker hang
    let resolve: (v: unknown) => void
    mockLoadSessionQuestions.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )

    const { container, unmount } = render(<QuizSessionLoader userId="test-user-id" />)

    // Skeleton elements have the animate-pulse class
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)

    // Resolve the pending promise and unmount to prevent forks worker timeout
    resolve!({ success: true, questions: [] })
    await waitFor(() => {})
    unmount()
  })

  it('shows an error message when loadSessionQuestions fails', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: false, error: 'RPC call failed' })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByText('RPC call failed')).toBeInTheDocument()
    })
  })

  it('renders QuizSession with the session ID when questions load successfully', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })
    expect(screen.getByText('session-abc')).toBeInTheDocument()
  })

  it('removes quiz-session from sessionStorage after reading it', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })
    expect(sessionStorage.getItem('quiz-session')).toBeNull()
  })

  it('passes the correct question IDs to loadSessionQuestions', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(mockLoadSessionQuestions).toHaveBeenCalledWith(['q1', 'q2'])
    })
  })

  it('clamps draftCurrentIndex to the last question when it exceeds the question count', async () => {
    const sessionWithOobIndex = {
      ...SESSION_DATA,
      draftCurrentIndex: 99, // way beyond QUESTIONS.length - 1 = 1
    }
    sessionStorage.setItem('quiz-session', JSON.stringify(sessionWithOobIndex))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })

    const el = screen.getByTestId('quiz-session')
    // QUESTIONS has 2 items → clamped to index 1
    expect(el.getAttribute('data-initial-index')).toBe('1')
  })

  it('passes undefined initialIndex when draftCurrentIndex is absent', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })

    const el = screen.getByTestId('quiz-session')
    // No draft index → attribute should be absent (undefined → not rendered)
    expect(el.getAttribute('data-initial-index')).toBeNull()
  })

  it('clears localStorage after sessionStorage handoff succeeds', async () => {
    sessionStorage.setItem('quiz-session', JSON.stringify(SESSION_DATA))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })
    // clearActiveSession is called once during this test's component mount
    expect(mockClearActiveSession).toHaveBeenCalled()
  })

  it('strips stale answer keys that are not present in the loaded questions', async () => {
    const sessionWithStaleAnswer = {
      ...SESSION_DATA,
      draftAnswers: {
        q1: { selectedOptionId: 'opt-a', responseTimeMs: 1000 },
        'deleted-question-id': { selectedOptionId: 'opt-b', responseTimeMs: 500 },
      },
    }
    sessionStorage.setItem('quiz-session', JSON.stringify(sessionWithStaleAnswer))
    mockLoadSessionQuestions.mockResolvedValue({ success: true, questions: QUESTIONS })

    render(<QuizSessionLoader userId="test-user-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('quiz-session')).toBeInTheDocument()
    })

    const el = screen.getByTestId('quiz-session')
    // Only q1 survives — the stale key is filtered out
    expect(el.getAttribute('data-answer-keys')).toBe('q1')
  })
})
