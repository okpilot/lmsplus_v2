import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
  it('renders the active-internal-exam title and subject', () => {
    render(<RecoveryBanner session={SESSION} />)
    expect(screen.getByText(/active internal exam in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/air law/i)).toBeInTheDocument()
  })

  it('links Resume to the session page without touching storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(<RecoveryBanner session={SESSION} />)

    expect(screen.getByRole('link', { name: /resume internal exam/i })).toHaveAttribute(
      'href',
      '/app/quiz/session/sess-active-001',
    )
    expect(setItem).not.toHaveBeenCalled()
  })

  it('falls back to a generic subtitle when subjectName is empty', () => {
    render(<RecoveryBanner session={{ ...SESSION, subjectName: '' }} />)
    expect(screen.getByText(/session in progress/i)).toBeInTheDocument()
  })

  it('renders with amber accent styling', () => {
    render(<RecoveryBanner session={SESSION} />)
    const banner = screen.getByTestId('internal-exam-recovery-banner')
    expect(banner.className).toContain('amber')
  })
})
