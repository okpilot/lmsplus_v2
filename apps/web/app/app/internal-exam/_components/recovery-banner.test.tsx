import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterPush } = vi.hoisted(() => ({ mockRouterPush: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

import type { ActiveInternalExamSession } from '../actions/get-active-internal-exam-session'
import { RecoveryBanner } from './recovery-banner'

const SESSION: ActiveInternalExamSession = {
  sessionId: 'sess-active-001',
  subjectId: 'subj-aaa',
  subjectName: 'Air Law',
  subjectCode: '010',
  startedAt: '2026-04-28T10:00:00.000Z',
  timeLimitSeconds: 3600,
  passMark: 75,
  questionIds: ['q-1', 'q-2'],
}

describe('RecoveryBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sessionStorage.clear()
  })

  it('renders the active-internal-exam title and subject', () => {
    render(<RecoveryBanner userId="user-1" session={SESSION} />)
    expect(screen.getByText(/active internal exam in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/air law/i)).toBeInTheDocument()
  })

  it('writes session handoff and navigates to /app/quiz/session on resume click', async () => {
    render(<RecoveryBanner userId="user-1" session={SESSION} />)
    await userEvent.click(screen.getByRole('button', { name: /resume internal exam/i }))

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
    const stored = sessionStorage.getItem('quiz-session:user-1')
    expect(stored).not.toBeNull()
    const payload = JSON.parse(stored as string)
    expect(payload).toMatchObject({
      userId: 'user-1',
      sessionId: 'sess-active-001',
      mode: 'exam',
      examMode: 'internal_exam',
      questionIds: ['q-1', 'q-2'],
      timeLimitSeconds: 3600,
      passMark: 75,
      subjectName: 'Air Law',
      subjectCode: '010',
    })
  })

  it('falls back to a generic subtitle when subjectName is empty', () => {
    render(<RecoveryBanner userId="user-1" session={{ ...SESSION, subjectName: '' }} />)
    expect(screen.getByText(/session in progress/i)).toBeInTheDocument()
  })

  it('renders with amber accent styling', () => {
    render(<RecoveryBanner userId="user-1" session={SESSION} />)
    const banner = screen.getByTestId('internal-exam-recovery-banner')
    expect(banner.className).toContain('amber')
  })
})
