import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockReadActiveSession,
  mockClearActiveSession,
  mockRouterPush,
  mockRouterRefresh,
  mockSaveDraft,
  mockDiscardQuiz,
} = vi.hoisted(() => ({
  mockReadActiveSession: vi.fn(),
  mockClearActiveSession: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockSaveDraft: vi.fn(),
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('../session/_utils/quiz-session-storage', () => ({
  readActiveSession: () => mockReadActiveSession(),
  clearActiveSession: mockClearActiveSession,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

vi.mock('../actions/draft', () => ({
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { QuizRecoveryBanner } from './quiz-recovery-banner'

// ---- Fixtures -------------------------------------------------------------

const ACTIVE_SESSION = {
  sessionId: 'sess-001',
  questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
  answers: {
    q1: { selectedOptionId: 'opt-a', responseTimeMs: 1000 },
    q2: { selectedOptionId: 'opt-b', responseTimeMs: 1200 },
  },
  currentIndex: 2,
  subjectName: 'Meteorology',
  subjectCode: 'MET',
  draftId: 'draft-001',
  savedAt: Date.now(),
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  // Default: no active session
  mockReadActiveSession.mockReturnValue(null)
  mockDiscardQuiz.mockResolvedValue({ success: true })
  mockSaveDraft.mockResolvedValue({ success: true })
})

// ---- Rendering ------------------------------------------------------------

describe('QuizRecoveryBanner — rendering', () => {
  it('renders nothing when no active session exists', () => {
    mockReadActiveSession.mockReturnValue(null)
    const { container } = render(<QuizRecoveryBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the banner when an active session is found', () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    render(<QuizRecoveryBanner />)
    expect(screen.getByText(/unfinished quiz found/i)).toBeInTheDocument()
  })

  it('shows subject name, answered count, and total count', () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    render(<QuizRecoveryBanner />)
    expect(screen.getByText(/meteorology/i)).toBeInTheDocument()
    expect(screen.getByText(/2 of 5 questions answered/i)).toBeInTheDocument()
  })

  it('omits subject name prefix when subjectName is absent', () => {
    mockReadActiveSession.mockReturnValue({ ...ACTIVE_SESSION, subjectName: undefined })
    render(<QuizRecoveryBanner />)
    // Subject name text is absent but answered count is still shown
    expect(screen.queryByText(/meteorology/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 of 5 questions answered/i)).toBeInTheDocument()
  })

  it('renders Resume, Save for Later, and Discard buttons', () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    render(<QuizRecoveryBanner />)
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save for later/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
  })
})

// ---- Resume ---------------------------------------------------------------

describe('QuizRecoveryBanner — Resume', () => {
  it('writes session data to sessionStorage and navigates to /app/quiz/session', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    const mockSetItem = vi.fn()
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: { setItem: mockSetItem, getItem: vi.fn(), removeItem: vi.fn() },
      writable: true,
      configurable: true,
    })

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /resume/i }))

    expect(mockSetItem).toHaveBeenCalledWith('quiz-session', expect.stringContaining('sess-001'))
    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })
})

// ---- Save for Later -------------------------------------------------------

describe('QuizRecoveryBanner — Save for Later', () => {
  it('calls saveDraft with session data and clears the banner on success', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockSaveDraft.mockResolvedValue({ success: true })

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /save for later/i }))

    await waitFor(() => expect(mockClearActiveSession).toHaveBeenCalledTimes(1))
    expect(mockSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'sess-001' }))
    // Banner disappears after success
    await waitFor(() =>
      expect(screen.queryByText(/unfinished quiz found/i)).not.toBeInTheDocument(),
    )
  })

  it('shows Save for Later button as loading while save is in progress', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    let resolve: (v: { success: true }) => void = () => {}
    mockSaveDraft.mockReturnValue(
      new Promise<{ success: true }>((r) => {
        resolve = r
      }),
    )

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /save for later/i }))

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled()
    resolve({ success: true })
  })

  it('shows error message when saveDraft returns failure', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockSaveDraft.mockResolvedValue({ success: false, error: 'Draft limit reached' })

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /save for later/i }))

    await waitFor(() => expect(screen.getByText('Draft limit reached')).toBeInTheDocument())
    // Banner remains visible
    expect(screen.getByText(/unfinished quiz found/i)).toBeInTheDocument()
  })

  it('shows a generic error when saveDraft throws', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockSaveDraft.mockRejectedValue(new Error('network failure'))

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /save for later/i }))

    await waitFor(() => expect(screen.getByText(/server unavailable/i)).toBeInTheDocument())
  })

  it('shows fallback error message when saveDraft returns no error string', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockSaveDraft.mockResolvedValue({ success: false })

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /save for later/i }))

    await waitFor(() => expect(screen.getByText(/failed to save/i)).toBeInTheDocument())
  })
})

// ---- Discard --------------------------------------------------------------

describe('QuizRecoveryBanner — Discard', () => {
  it('clears the session and hides the banner immediately on discard', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /discard/i }))

    expect(mockClearActiveSession).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/unfinished quiz found/i)).not.toBeInTheDocument()
  })

  it('calls discardQuiz in the background with the session id', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /discard/i }))

    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-001' }))
  })

  it('does not block the UI when discardQuiz fails', async () => {
    mockReadActiveSession.mockReturnValue(ACTIVE_SESSION)
    mockDiscardQuiz.mockRejectedValue(new Error('server error'))

    render(<QuizRecoveryBanner />)
    await userEvent.click(screen.getByRole('button', { name: /discard/i }))

    // Banner already hidden — discard failure is silently swallowed
    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/unfinished quiz found/i)).not.toBeInTheDocument()
  })
})
