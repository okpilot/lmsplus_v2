import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRouterPush = vi.fn()
const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

const mockDeleteDraft = vi.fn()
vi.mock('../actions/discard-and-refresh', () => ({
  deleteDraftAndRefresh: (...args: unknown[]) => mockDeleteDraft(...args),
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

const DIALOG_NAME = 'Delete this saved quiz?'

async function openDialog() {
  return screen.findByRole('alertdialog', { name: DIALOG_NAME })
}

async function confirmDelete() {
  const dialog = await openDialog()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
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
    expect(screen.getByText(/no saved quizzes/i).closest('[data-slot="empty"]')).not.toBeNull()
  })

  it('hides the empty state when saved quizzes failed to load', () => {
    render(<SavedDraftCard drafts={[]} savedSessions={[]} savedLookupFailed />)
    expect(screen.queryByText(/no saved quizzes/i)).not.toBeInTheDocument()
  })

  it('opens an alertdialog with the fixed copy when Delete is clicked', async () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    const dialog = await openDialog()
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('keeps the quiz and closes the dialog when Cancel is clicked', async () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mockDeleteDraft).not.toHaveBeenCalled()
  })

  it('runs the delete once and closes the dialog when Delete is confirmed', async () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))
    await confirmDelete()

    await waitFor(() => expect(mockDeleteDraft).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('disables both dialog buttons while the delete is in progress', async () => {
    mockDeleteDraft.mockReturnValue(new Promise(() => {}))
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled(),
    )
    expect(within(dialog).getByRole('button', { name: /Delete/ })).toBeDisabled()
  })

  it('deletes the draft in one request without a separate router refresh', async () => {
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))
    await confirmDelete()

    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: 'draft-1' })
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('shows error when delete fails', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })
    render(<SavedDraftCard drafts={[DRAFT]} savedSessions={[]} />)
    fireEvent.click(screen.getByTestId('delete-draft'))
    await confirmDelete()

    await waitFor(() => {
      expect(screen.getByText(/failed to delete/i)).toBeInTheDocument()
    })
  })
})
