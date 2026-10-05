import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockDeleteDraft, mockResumeQuizSession } = vi.hoisted(() => ({
  mockDeleteDraft: vi.fn(),
  mockResumeQuizSession: vi.fn(),
}))

vi.mock('../actions/draft-delete', () => ({
  deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
}))

vi.mock('../actions/resume', () => ({
  resumeQuizSession: (...args: unknown[]) => mockResumeQuizSession(...args),
}))

const mockRouterPush = vi.fn()
const mockRouterRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

// ---- Subject under test ---------------------------------------------------

import type { DraftData } from '../types'
import { DraftCard } from './draft-card'

// ---- Fixtures -------------------------------------------------------------

const DRAFT: DraftData = {
  id: 'draft-1',
  sessionId: 'sess-abc',
  questionIds: ['q1', 'q2', 'q3', 'q4'],
  answers: {
    q1: { selectedOptionId: 'opt-a', responseTimeMs: 2000 },
    q2: { selectedOptionId: 'opt-b', responseTimeMs: 1500 },
  },
  currentIndex: 2,
  subjectName: 'Meteorology',
  subjectCode: 'MET',
  createdAt: '2026-03-12T10:00:00Z',
}

// ---- Lifecycle ------------------------------------------------------------

const NEW_SESSION_ID = 'new-sess-xyz'

beforeEach(() => {
  vi.resetAllMocks()
  mockDeleteDraft.mockResolvedValue({ success: true })
  // Resume mints a fresh session server-side (#1085) and returns its NEW id.
  mockResumeQuizSession.mockResolvedValue({
    success: true,
    sessionId: NEW_SESSION_ID,
    questionIds: DRAFT.questionIds,
  })
  // Default confirm to true
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

// ---- Rendering ------------------------------------------------------------

describe('DraftCard — rendering', () => {
  it('displays subject name', () => {
    render(<DraftCard draft={DRAFT} />)
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('displays answered count and total', () => {
    render(<DraftCard draft={DRAFT} />)
    expect(screen.getByText('2 of 4 answered')).toBeInTheDocument()
  })

  it('shows "Unknown subject" when subjectName is absent', () => {
    render(<DraftCard draft={{ ...DRAFT, subjectName: undefined }} />)
    expect(screen.getByText('Unknown subject')).toBeInTheDocument()
  })

  it('shows progress bar at correct width', () => {
    render(<DraftCard draft={DRAFT} />)
    const bar = screen.getByTestId('draft-progress')
    // 2 of 4 = 50%
    expect(bar).toHaveStyle({ width: '50%' })
  })

  it('shows 0% progress bar when there are no answers', () => {
    render(<DraftCard draft={{ ...DRAFT, answers: {} }} />)
    const bar = screen.getByTestId('draft-progress')
    expect(bar).toHaveStyle({ width: '0%' })
  })

  it('shows formatted save date when createdAt is present', () => {
    render(<DraftCard draft={DRAFT} />)
    // The date is inside a <p> with text "Saved <date> UTC"
    expect(
      screen.getByText(
        (_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith('Saved'),
      ),
    ).toBeInTheDocument()
  })

  it('does not show save date when createdAt is absent', () => {
    render(<DraftCard draft={{ ...DRAFT, createdAt: undefined }} />)
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })

  it('renders Resume and Delete buttons', () => {
    render(<DraftCard draft={DRAFT} />)
    expect(screen.getByTestId('resume-draft')).toBeInTheDocument()
    expect(screen.getByTestId('delete-draft')).toBeInTheDocument()
  })
})

// ---- Resume ---------------------------------------------------------------

describe('DraftCard — Resume', () => {
  it('resumes the draft and navigates to /app/quiz/session/<newId> without writing sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('resume-draft'))

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${NEW_SESSION_ID}`),
    )
    expect(mockResumeQuizSession).toHaveBeenCalledWith({ draftId: DRAFT.id })
    expect(setItem).not.toHaveBeenCalled()
  })

  it('shows an error and does not navigate when resume fails', async () => {
    mockResumeQuizSession.mockResolvedValue({
      success: false,
      error: 'You already have an active session.',
    })
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('resume-draft'))

    await waitFor(() =>
      expect(screen.getByText('You already have an active session.')).toBeInTheDocument(),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('disables the Resume button and shows a resuming state while resume is in flight', () => {
    mockResumeQuizSession.mockReturnValue(new Promise(() => {}))
    render(<DraftCard draft={DRAFT} />)
    const button = screen.getByTestId('resume-draft')
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(screen.getByText('Resuming...')).toBeInTheDocument()
    expect(mockResumeQuizSession).toHaveBeenCalledTimes(1)
  })

  it('does not start a second resume while one is already in flight', () => {
    // Never-resolving resume keeps the first call in flight; the synchronous one-shot
    // ref (not the async disabled state) must block the second click in the same tick.
    mockResumeQuizSession.mockReturnValue(new Promise(() => {}))
    render(<DraftCard draft={DRAFT} />)
    const button = screen.getByTestId('resume-draft')
    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockResumeQuizSession).toHaveBeenCalledTimes(1)
  })

  it('re-enables Resume after a thrown resume rejection so the user can retry', async () => {
    mockResumeQuizSession.mockRejectedValueOnce(new Error('network down'))
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('resume-draft'))

    await waitFor(() =>
      expect(screen.getByText('Unable to resume right now. Please try again.')).toBeInTheDocument(),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
    // The one-shot ref was released: the button is enabled and a second attempt fires.
    const button = screen.getByTestId('resume-draft')
    expect(button).not.toBeDisabled()
    mockResumeQuizSession.mockResolvedValueOnce({
      success: true,
      sessionId: NEW_SESSION_ID,
      questionIds: DRAFT.questionIds,
    })
    fireEvent.click(button)
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith(`/app/quiz/session/${NEW_SESSION_ID}`),
    )
  })
})

// ---- Delete ---------------------------------------------------------------

describe('DraftCard — Delete', () => {
  it('calls deleteDraft with the draft id after confirm', async () => {
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: 'draft-1' }))
  })

  it('does not call deleteDraft when the user cancels the confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => expect(mockDeleteDraft).not.toHaveBeenCalled())
  })

  it('calls router.refresh after successful delete', async () => {
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => expect(mockRouterRefresh).toHaveBeenCalledTimes(1))
  })

  it('shows Deleting... while delete is in progress', () => {
    mockDeleteDraft.mockReturnValue(new Promise(() => {}))
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    expect(screen.getByText('Deleting...')).toBeInTheDocument()
  })

  it('disables the delete button while deletion is in progress', () => {
    mockDeleteDraft.mockReturnValue(new Promise(() => {}))
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    expect(screen.getByTestId('delete-draft')).toBeDisabled()
  })

  it('shows error message when deleteDraft returns failure', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() =>
      expect(screen.getByText('Failed to delete. Please try again.')).toBeInTheDocument(),
    )
  })

  it('re-enables the delete button after a failed delete', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })
    render(<DraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => expect(screen.getByTestId('delete-draft')).not.toBeDisabled())
  })
})
