import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

const { mockDiscardQuiz } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

vi.mock('../session/_utils/quiz-session-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session/_utils/quiz-session-storage')>()
  return {
    ...actual,
    sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
  }
})

// ---- Subject under test ---------------------------------------------------

import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { ResumeExamBanner } from './resume-exam-banner'

// ---- Fixtures -------------------------------------------------------------

const EXAM: ActiveExamSession = {
  sessionId: 'sess-exam-001',
  subjectId: 'subj-aaa',
  subjectName: 'Air Law',
  startedAt: '2026-04-27T10:00:00.000Z',
  timeLimitSeconds: 3600,
}

const USER_ID = 'user-test'

// ---- Session storage helpers ---------------------------------------------

const originalSessionStorage = globalThis.sessionStorage

afterEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: originalSessionStorage,
    writable: true,
    configurable: true,
  })
})

beforeEach(() => {
  vi.resetAllMocks()
  mockDiscardQuiz.mockResolvedValue({ success: true })
})

// ---- Rendering ------------------------------------------------------------

describe('ResumeExamBanner — rendering', () => {
  it('renders the banner with the subject name', () => {
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    expect(screen.getByText(/practice exam in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/air law/i)).toBeInTheDocument()
  })

  it('renders Resume Practice Exam and Discard buttons', () => {
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    expect(screen.getByRole('button', { name: /resume practice exam/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument()
  })

  it('renders with amber accent styling', () => {
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    const banner = screen.getByText(/practice exam in progress/i).closest('div.rounded-lg')
    expect(banner?.className).toContain('amber')
  })
})

// ---- Resume ---------------------------------------------------------------

describe('ResumeExamBanner — Resume', () => {
  it('writes sessionId and mode=exam to sessionStorage and navigates', async () => {
    const mockSetItem = vi.fn()
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: { setItem: mockSetItem, getItem: vi.fn(), removeItem: vi.fn() },
      writable: true,
      configurable: true,
    })

    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    await userEvent.click(screen.getByRole('button', { name: /resume practice exam/i }))

    expect(mockSetItem).toHaveBeenCalledWith(
      `quiz-session:${USER_ID}`,
      expect.stringContaining('sess-exam-001'),
    )
    const stored = JSON.parse(mockSetItem.mock.calls[0]?.[1] as string)
    expect(stored.mode).toBe('exam')
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('shows an error and does not navigate when sessionStorage.setItem throws', async () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        setItem: vi.fn(() => {
          throw new DOMException('QuotaExceededError')
        }),
        getItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
      configurable: true,
    })

    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    await userEvent.click(screen.getByRole('button', { name: /resume practice exam/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to resume/i)
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

// ---- Discard --------------------------------------------------------------

describe('ResumeExamBanner — Discard', () => {
  it('calls discardQuiz with the sessionId and hides the banner on success', async () => {
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() =>
      expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-exam-001' }),
    )
    expect(screen.queryByText(/practice exam in progress/i)).not.toBeInTheDocument()
  })

  it('refreshes the router after a successful discard', async () => {
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalledTimes(1))
  })

  it('shows error and keeps banner when discardQuiz returns failure', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })

    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() => expect(screen.getByText('Session not found')).toBeInTheDocument())
    expect(screen.getByText(/practice exam in progress/i)).toBeInTheDocument()
  })

  it('shows generic error when discardQuiz throws', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))

    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() => expect(screen.getByText(/server unavailable/i)).toBeInTheDocument())
  })
})
