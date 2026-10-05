import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAuth, mockEntry } = vi.hoisted(() => ({ mockAuth: vi.fn(), mockEntry: vi.fn() }))

vi.mock('@/lib/auth/require-auth-user', () => ({ requireAuthUser: mockAuth }))
vi.mock('../_loaders/load-session-entry', () => ({
  loadSessionEntry: (...a: unknown[]) => mockEntry(...a),
}))
vi.mock('../_components/session-entry-view', () => ({
  SessionEntryView: ({ userId, entry }: { userId: string; entry: { kind: string } }) => (
    <div data-testid="entry-view">{`${userId}:${entry.kind}`}</div>
  ),
}))
vi.mock('../_components/connection-overlay', () => ({
  ConnectionOverlay: () => <div data-testid="overlay" />,
}))

import QuizSessionByIdPage, { dynamic } from './page'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.mockResolvedValue({ id: 'user-1' })
  mockEntry.mockResolvedValue({ kind: 'open' })
})

describe('QuizSessionByIdPage', () => {
  it('renders fresh on every request', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('loads the session named in the URL for the signed-in student', async () => {
    const ui = await QuizSessionByIdPage({ params: Promise.resolve({ id: 'sess-1' }) })
    render(ui)

    expect(mockEntry).toHaveBeenCalledWith('sess-1', 'user-1')
    expect(screen.getByTestId('entry-view')).toHaveTextContent('user-1:open')
    expect(screen.getByTestId('overlay')).toBeInTheDocument()
  })
})
