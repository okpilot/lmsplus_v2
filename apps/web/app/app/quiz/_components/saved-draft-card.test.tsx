import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRouterPush = vi.fn()
const mockRouterRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

const mockDeleteDraft = vi.fn()
vi.mock('../actions/draft', () => ({
  deleteDraft: (...args: unknown[]) => mockDeleteDraft(...args),
}))

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

describe('SavedDraftCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockDeleteDraft.mockResolvedValue({ success: true })
  })

  it('shows empty state when no draft', () => {
    render(<SavedDraftCard draft={null} />)
    expect(screen.getByText(/no saved quiz/i)).toBeInTheDocument()
  })

  it('displays subject name and code', () => {
    render(<SavedDraftCard draft={DRAFT} />)
    expect(screen.getByText('Principles of Flight')).toBeInTheDocument()
    expect(screen.getByText('POF')).toBeInTheDocument()
  })

  it('displays progress count', () => {
    render(<SavedDraftCard draft={DRAFT} />)
    expect(screen.getByText('2 of 5 answered')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('displays date', () => {
    render(<SavedDraftCard draft={DRAFT} />)
    // Date format depends on locale, just check it renders something
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it('shows "Unknown subject" fallback when subjectName is missing', () => {
    const draft = { ...DRAFT, subjectName: undefined, subjectCode: undefined }
    render(<SavedDraftCard draft={draft} />)
    expect(screen.getByText('Unknown subject')).toBeInTheDocument()
  })

  it('stores session data and navigates on resume', () => {
    const spy = vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem')
    render(<SavedDraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('resume-draft'))

    expect(spy).toHaveBeenCalledWith(
      'quiz-session',
      expect.stringContaining('"sessionId":"sess-1"'),
    )
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
    spy.mockRestore()
  })

  it('calls deleteDraft and refreshes on delete', async () => {
    render(<SavedDraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => {
      expect(mockDeleteDraft).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('shows error when delete fails', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })
    render(<SavedDraftCard draft={DRAFT} />)
    fireEvent.click(screen.getByTestId('delete-draft'))

    await waitFor(() => {
      expect(screen.getByText(/failed to delete/i)).toBeInTheDocument()
    })
  })
})
