import { act, render, screen, waitFor } from '@testing-library/react'
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

import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { ActivePracticeBanner } from './active-practice-banner'

// ---- Fixtures -------------------------------------------------------------

const SESSION: ActivePracticeSession = {
  sessionId: 'sess-prac-001',
  mode: 'quick_quiz',
  subjectId: 'subj-aaa',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  startedAt: '2026-04-27T10:00:00.000Z',
}

const SMART_REVIEW_SESSION: ActivePracticeSession = { ...SESSION, mode: 'smart_review' }

beforeEach(() => {
  vi.resetAllMocks()
  mockDiscardQuiz.mockResolvedValue({ success: true })
})

// ---- Rendering ------------------------------------------------------------

describe('ActivePracticeBanner — rendering', () => {
  it('names the Quick Quiz mode and subject in the notice', () => {
    render(<ActivePracticeBanner session={SESSION} />)
    expect(screen.getByText(/^unfinished quick quiz session$/i)).toBeInTheDocument()
    expect(screen.getByText(/air law/i)).toBeInTheDocument()
  })

  it('names the Smart Review mode for a smart_review session', () => {
    render(<ActivePracticeBanner session={SMART_REVIEW_SESSION} />)
    expect(screen.getByText(/^unfinished smart review session$/i)).toBeInTheDocument()
  })

  it('offers a Discard control but no Resume control', () => {
    render(<ActivePracticeBanner session={SESSION} />)
    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument()
  })
})

// ---- Discard --------------------------------------------------------------

describe('ActivePracticeBanner — Discard', () => {
  it('discards the active session and refreshes in place on success', async () => {
    render(<ActivePracticeBanner session={SESSION} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() =>
      expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-prac-001' }),
    )
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/^unfinished quick quiz session$/i)).not.toBeInTheDocument()
  })

  it('shows the error visibly inside the open dialog when discard fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })

    render(<ActivePracticeBanner session={SESSION} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    // The error renders inside the still-open AlertDialog (the action does not close
    // it), so it must be visible — not hidden behind the overlay in the banner.
    const alert = await screen.findByRole('alert')
    expect(alert).toBeVisible()
    expect(alert).toHaveTextContent('Session not found')
    expect(screen.getByText(/^unfinished quick quiz session$/i)).toBeInTheDocument()
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('shows a generic dialog error and does not refresh when the discard request fails', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))

    render(<ActivePracticeBanner session={SESSION} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    const alert = await screen.findByRole('alert')
    expect(alert).toBeVisible()
    expect(alert).toHaveTextContent(/server unavailable/i)
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('keeps Cancel disabled so the dialog cannot be dismissed while a discard is pending', async () => {
    // Keep the discard pending so the dialog stays open mid-request.
    mockDiscardQuiz.mockReturnValue(new Promise(() => {}))

    render(<ActivePracticeBanner session={SESSION} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))

    await waitFor(() => expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled())
  })

  it('submits a single discard when confirm is double-clicked before the first settles', async () => {
    // Keep the first discard pending so both synchronous clicks observe the same
    // render. A loading-state-only guard would let both through (setState is batched,
    // so `loading` reads false on the second click); the synchronous useRef guard
    // sets `discardingRef.current = true` on the first click and rejects the second.
    let resolveDiscard!: (v: { success: true }) => void
    mockDiscardQuiz.mockReturnValue(
      new Promise<{ success: true }>((res) => {
        resolveDiscard = res
      }),
    )

    render(<ActivePracticeBanner session={SESSION} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    const action = screen.getByRole('button', { name: /^discard$/i, hidden: false })

    // Two native clicks in one act batch — both reach the handler before the
    // dialog-close re-render commits.
    await act(async () => {
      action.click()
      action.click()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDiscard({ success: true })
    })
  })
})
