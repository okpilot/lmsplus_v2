import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./saved-session-resume', () => ({
  SavedSessionResume: (p: Record<string, unknown>) => (
    <div data-testid="saved">{JSON.stringify(p)}</div>
  ),
}))
vi.mock('./server-session-loader', () => ({
  ServerSessionLoader: (p: { entry: { sessionId: string }; userId: string }) => (
    <div data-testid="loader">{`${p.userId}:${p.entry.sessionId}`}</div>
  ),
}))

import { SessionEntryView } from './session-entry-view'

const DATA = {
  sessionId: 's1',
  mode: 'quick_quiz' as const,
  questionIds: ['q1', 'q2', 'q3'],
  startedAt: '2026-10-01T10:00:00.000Z',
  subjectName: 'Air Law',
  seed: {
    answers: { q1: { selectedOptionId: 'a', responseTimeMs: 1 } },
    activeMs: 1,
    pinnedQuestionIds: [],
    currentIndex: 0,
  },
}

describe('SessionEntryView', () => {
  it('opens the runner for an open session', () => {
    render(<SessionEntryView userId="u1" entry={{ kind: 'open', ...DATA }} />)

    expect(screen.getByTestId('loader')).toHaveTextContent('u1:s1')
    expect(screen.queryByTestId('saved')).not.toBeInTheDocument()
  })

  it('offers resume or delete for a saved session, with its progress', () => {
    render(<SessionEntryView userId="u1" entry={{ kind: 'saved', ...DATA }} />)

    expect(JSON.parse(screen.getByTestId('saved').textContent ?? '{}')).toEqual({
      sessionId: 's1',
      subjectName: 'Air Law',
      mode: 'quick_quiz',
      answeredCount: 1,
      totalCount: 3,
    })
    expect(screen.queryByTestId('loader')).not.toBeInTheDocument()
  })
})
