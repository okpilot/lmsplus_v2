import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRouterPush = vi.fn()
const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

const mockDeleteDraft = vi.fn()
vi.mock('../actions/draft-delete', () => ({
  deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
}))

const mockResumeQuizSession = vi.fn()
vi.mock('../actions/resume', () => ({
  resumeQuizSession: (...args: unknown[]) => mockResumeQuizSession(...args),
}))

import type { SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import type { DraftData } from '../types'
import { SavedDraftCard } from './saved-draft-card'

const DRAFT: DraftData = {
  id: 'draft-1',
  sessionId: 'sess-1',
  questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
  answers: {
    q1: { selectedOptionId: 'a', responseTimeMs: 1000 },
    q2: { selectedOptionId: 'b', responseTimeMs: 2000 },
  },
  currentIndex: 2,
  subjectName: 'Principles of Flight',
  subjectCode: 'POF',
  createdAt: '2026-03-12T10:00:00Z',
}

const DRAFT_2: DraftData = {
  id: 'draft-2',
  sessionId: 'sess-2',
  questionIds: ['q6', 'q7'],
  answers: {},
  currentIndex: 0,
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  createdAt: '2026-03-13T10:00:00Z',
}

const SAVED: SavedQuizSession = {
  sessionId: 'saved-1',
  mode: 'quick_quiz',
  savedAt: '2026-10-04T09:00:00Z',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  totalCount: 10,
  answeredCount: 4,
}

describe('SavedDraftCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockDeleteDraft.mockResolvedValue({ success: true })
    mockResumeQuizSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1-new',
      questionIds: DRAFT.questionIds,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('shows empty state when drafts array is empty', () => {
    render(<SavedDraftCard drafts={[]} savedSessions={[]} />)
    expect(screen.getByText(/no saved quizzes/i)).toBeInTheDocument()
  })

  it('displays subject name', () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    expect(screen.getByText('Principles of Flight')).toBeInTheDocument()
  })

  it('displays progress count', () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    expect(screen.getByText('2 of 5 answered')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('displays date', () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    // Date format depends on locale, just check it renders something
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it('shows "Unknown subject" fallback when subjectName is missing', () => {
    const draft = { ...DRAFT, subjectName: undefined, subjectCode: undefined }
    render(<SavedDraftCard drafts={[draft]} savedSessions={[]} />)
    expect(screen.getByText('Unknown subject')).toBeInTheDocument()
  })

  it('renders multiple draft cards', () => {
    render(<SavedDraftCard drafts={[DRAFT, DRAFT_2]} savedSessions={[]} />)
    expect(screen.getByText('Principles of Flight')).toBeInTheDocument()
    expect(screen.getByText('Air Law')).toBeInTheDocument()
    expect(screen.getAllByTestId('resume-draft')).toHaveLength(2)
    expect(screen.getAllByTestId('delete-draft')).toHaveLength(2)
  })

  it('navigates to /app/quiz/session/<newId> on resume of an old draft', async () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('resume-draft'))

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session/sess-1-new'))
  })

  it('lists server-saved sessions together with old drafts', () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[SAVED]} />)
    expect(screen.getAllByTestId('resume-draft')).toHaveLength(1)
    expect(screen.getAllByTestId('resume-saved-session')).toHaveLength(1)
    expect(screen.getByText('Air Law')).toBeInTheDocument()
  })

  it('shows the empty state only when there are no drafts and no saved sessions', () => {
    const { rerender } = render(<SavedDraftCard drafts={[]} savedSessions={[SAVED]} />)
    expect(screen.queryByText(/no saved quizzes/i)).not.toBeInTheDocument()
    rerender(<SavedDraftCard drafts={[]} savedSessions={[]} />)
    expect(screen.getByText(/no saved quizzes/i)).toBeInTheDocument()
  })

  it('hides the empty state when saved quizzes failed to load', () => {
    render(<SavedDraftCard drafts={[]} savedSessions={[]} savedLookupFailed />)
    expect(screen.queryByText(/no saved quizzes/i)).not.toBeInTheDocument()
  })

  it('does not call deleteDraft when the user cancels the confirmation dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    // Allow any async effects to flush
    await new Promise((r) => setTimeout(r, 0))
    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('calls deleteDraft with draftId and refreshes on delete', async () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: 'draft-1' })
    })
    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('shows error when delete fails', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => {
      expect(screen.getByText(/failed to delete/i)).toBeInTheDocument()
    })
  })
})
