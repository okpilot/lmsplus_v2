import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRouterPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

const { mockDeleteDraft } = vi.hoisted(() => ({
  mockDeleteDraft: vi.fn(),
}))

vi.mock('../actions/draft', () => ({
  deleteDraft: mockDeleteDraft,
}))

// ---- Subject under test ---------------------------------------------------

import { ResumeDraftBanner } from './resume-draft-banner'

// ---- Fixtures -------------------------------------------------------------

const DRAFT = {
  id: 'draft-1',
  sessionId: 'session-abc',
  questionIds: ['q1', 'q2', 'q3'],
  answers: {
    q1: { selectedOptionId: 'opt-a', responseTimeMs: 2000 },
  },
  currentIndex: 1,
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockDeleteDraft.mockResolvedValue({ success: true })
})

describe('ResumeDraftBanner', () => {
  it('displays the answered count and total', () => {
    render(<ResumeDraftBanner draft={DRAFT} />)
    expect(screen.getByText('1 of 3 questions answered')).toBeInTheDocument()
  })

  it('shows the resume prompt text', () => {
    render(<ResumeDraftBanner draft={DRAFT} />)
    expect(screen.getByText('Resume unfinished quiz?')).toBeInTheDocument()
  })

  it('navigates to quiz session with draft data on Resume click', () => {
    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Resume'))

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')

    const stored = JSON.parse(sessionStorage.getItem('quiz-session') ?? '{}')
    expect(stored.sessionId).toBe('session-abc')
    expect(stored.questionIds).toEqual(['q1', 'q2', 'q3'])
    expect(stored.draftAnswers).toEqual(DRAFT.answers)
    expect(stored.draftCurrentIndex).toBe(1)
  })

  it('hides the banner and calls deleteDraft with draftId on Discard click', async () => {
    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Discard'))

    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: 'draft-1' })
    })

    expect(screen.queryByText('Resume unfinished quiz?')).not.toBeInTheDocument()
  })

  it('shows Discarding... text while deleting', async () => {
    // Make deleteDraft hang so we can observe the intermediate state
    mockDeleteDraft.mockReturnValue(new Promise(() => {}))

    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Discard'))

    expect(screen.getByText('Discarding...')).toBeInTheDocument()
  })

  it('keeps the banner visible when deleteDraft returns failure', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })

    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Discard'))

    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalledTimes(1)
    })

    // Banner must still be visible because the delete failed
    expect(screen.getByText('Resume unfinished quiz?')).toBeInTheDocument()
  })

  it('shows error message and keeps banner visible when deleteDraft throws', async () => {
    mockDeleteDraft.mockRejectedValue(new Error('network error'))

    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Discard'))

    await waitFor(() => {
      expect(screen.getByText('Failed to discard. Please try again.')).toBeInTheDocument()
    })

    expect(screen.getByText('Resume unfinished quiz?')).toBeInTheDocument()
  })

  it('re-enables Discard button after deleteDraft throws (finally block resets loading)', async () => {
    mockDeleteDraft.mockRejectedValue(new Error('network error'))

    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Discard'))

    await waitFor(() => {
      expect(screen.getByText('Discard')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Discard' })).not.toBeDisabled()
  })

  it('re-enables Discard button after deleteDraft returns failure (finally block resets loading)', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })

    render(<ResumeDraftBanner draft={DRAFT} />)
    fireEvent.click(screen.getByText('Discard'))

    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByRole('button', { name: 'Discard' })).not.toBeDisabled()
  })
})
