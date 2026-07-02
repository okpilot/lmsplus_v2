import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OralSessionSummary } from '@/lib/queries/oral-exam-session'

const { mockRequireAuthUser, mockGetActiveOralExamSession } = vi.hoisted(() => ({
  mockRequireAuthUser: vi.fn(),
  mockGetActiveOralExamSession: vi.fn(),
}))

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: mockRequireAuthUser,
}))

vi.mock('@/lib/queries/oral-exam-session', () => ({
  getActiveOralExamSession: mockGetActiveOralExamSession,
}))

// ElpHome has its own test file — here we only verify the page reads the
// caller's server-side session state and forwards it as the activeSession prop.
vi.mock('./_components/elp-home', () => ({
  ElpHome: ({ activeSession }: { activeSession: OralSessionSummary | null }) => (
    <div data-testid="elp-home" data-active-session={activeSession ? activeSession.id : ''} />
  ),
}))

import ElpPage from './page'

async function renderPage() {
  const jsx = await ElpPage()
  render(jsx)
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAuthUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
})

describe('ElpPage', () => {
  it('surfaces an in-progress server session so the student can resume it', async () => {
    const activeSession: OralSessionSummary = {
      id: 'session-1',
      status: 'in_progress',
      mode: 'practice',
      sections: [{ sectionNo: 1, type: 'interview' }],
    }
    mockGetActiveOralExamSession.mockResolvedValue(activeSession)

    await renderPage()

    expect(screen.getByTestId('elp-home').dataset.activeSession).toBe('session-1')
  })

  it('shows the start screen when the student has no active server session', async () => {
    mockGetActiveOralExamSession.mockResolvedValue(null)

    await renderPage()

    expect(screen.getByTestId('elp-home').dataset.activeSession).toBe('')
  })
})
