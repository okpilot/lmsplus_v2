import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./quiz-tabs', () => ({
  QuizTabs: (p: {
    draftCount: number
    newQuizContent: ReactNode
    savedDraftContent: ReactNode
  }) => (
    <div>
      <span data-testid="badge">{p.draftCount}</span>
      <div data-testid="new">{p.newQuizContent}</div>
      <div data-testid="saved">{p.savedDraftContent}</div>
    </div>
  ),
}))
vi.mock('./subjects-section', () => ({
  SubjectsSection: (p: { userId: string }) => <div data-testid="subjects" data-user={p.userId} />,
}))
vi.mock('./saved-draft-card', () => ({
  SavedDraftCard: (p: {
    drafts: unknown[]
    savedSessions: unknown[]
    savedLookupFailed: boolean
  }) => (
    <div
      data-testid="saved-card"
      data-drafts={p.drafts.length}
      data-sessions={p.savedSessions.length}
      data-failed={String(p.savedLookupFailed)}
    />
  ),
}))

import { QuizPageTabs } from './quiz-page-tabs'

type Props = Parameters<typeof QuizPageTabs>[0]

const props = {
  userId: 'u1',
  drafts: [{ id: 'd1' }, { id: 'd2' }],
  savedSessions: [{ id: 's1' }],
  savedTabCount: 3,
  savedLookupFailed: true,
} as unknown as Props

describe('QuizPageTabs', () => {
  it('shows the saved count on the tab badge', () => {
    render(<QuizPageTabs {...props} />)
    expect(screen.getByTestId('badge').textContent).toBe('3')
  })

  it('lists two drafts and one saved session and marks the saved lookup as failed', () => {
    render(<QuizPageTabs {...props} />)
    const card = screen.getByTestId('saved-card')
    expect(card.getAttribute('data-drafts')).toBe('2')
    expect(card.getAttribute('data-sessions')).toBe('1')
    expect(card.getAttribute('data-failed')).toBe('true')
  })

  it('renders the new-quiz subjects for the user', () => {
    render(<QuizPageTabs {...props} />)
    expect(screen.getByTestId('subjects').getAttribute('data-user')).toBe('u1')
  })
})
