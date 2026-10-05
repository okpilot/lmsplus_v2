import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

const { mockDiscardQuiz } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

// ---- Subject under test ---------------------------------------------------

import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { ResumeExamBanner } from './resume-exam-banner'

// ---- Fixtures -------------------------------------------------------------

const EXAM: ActiveExamSession = {
  sessionId: 'sess-exam-001',
  subjectId: 'subj-aaa',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  startedAt: '2026-04-27T10:00:00.000Z',
  timeLimitSeconds: 3600,
  passMark: 75,
  questionIds: ['q-1', 'q-2'],
}

const USER_ID = 'user-test'

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

  it('renders a Resume Practice Exam link and a Discard button', () => {
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)
    expect(screen.getByRole('link', { name: /resume practice exam/i })).toBeInTheDocument()
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
  it('links Resume to the session page for this exam, without touching storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<ResumeExamBanner userId={USER_ID} exam={EXAM} />)

    expect(screen.getByRole('link', { name: /resume practice exam/i })).toHaveAttribute(
      'href',
      '/app/quiz/session/sess-exam-001',
    )
    expect(setItem).not.toHaveBeenCalled()
  })
})

// ---- Discard-only (orphaned session) ---------------------------------------

describe('ResumeExamBanner — discardOnly', () => {
  it('hides the Resume button when discardOnly is true', () => {
    render(<ResumeExamBanner userId={USER_ID} sessionId="sess-orphan" discardOnly />)
    expect(screen.queryByRole('link', { name: /resume practice exam/i })).not.toBeInTheDocument()
  })

  it('shows the orphan-specific title copy', () => {
    render(<ResumeExamBanner userId={USER_ID} sessionId="sess-orphan" discardOnly />)
    expect(screen.getByText(/practice exam stuck/i)).toBeInTheDocument()
  })

  it('shows only the Discard button', () => {
    render(<ResumeExamBanner userId={USER_ID} sessionId="sess-orphan" discardOnly />)
    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument()
  })

  it('calls discardQuiz with the orphaned sessionId and hides the banner on success', async () => {
    render(<ResumeExamBanner userId={USER_ID} sessionId="sess-orphan" discardOnly />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() => expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-orphan' }))
    expect(screen.queryByText(/practice exam stuck/i)).not.toBeInTheDocument()
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
