import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_components/exam-countdown-timer', () => ({
  ExamCountdownTimer: ({ timeLimitSeconds }: { timeLimitSeconds: number }) => (
    <span data-testid="countdown">{timeLimitSeconds}</span>
  ),
}))

import { ExamBadge, ExamSessionHeader } from './exam-session-header'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ExamBadge', () => {
  it('renders "PRACTICE EXAM" for mock_exam mode', () => {
    render(<ExamBadge mode="mock_exam" />)
    expect(screen.getByText('PRACTICE EXAM')).toBeInTheDocument()
  })

  it('renders "INTERNAL EXAM" for internal_exam mode', () => {
    render(<ExamBadge mode="internal_exam" />)
    expect(screen.getByText('INTERNAL EXAM')).toBeInTheDocument()
  })

  it('defaults to mock_exam label when no mode is provided', () => {
    render(<ExamBadge />)
    expect(screen.getByText('PRACTICE EXAM')).toBeInTheDocument()
  })
})

describe('ExamSessionHeader', () => {
  const baseProps = {
    mode: 'mock_exam' as const,
    timeLimitSeconds: 3600,
    startedAt: Date.now(),
    onExpired: vi.fn(),
  }

  it('shows the correct badge label for mock_exam mode', () => {
    render(<ExamSessionHeader {...baseProps} />)
    expect(screen.getByText('PRACTICE EXAM')).toBeInTheDocument()
  })

  it('shows the correct badge label for internal_exam mode', () => {
    render(<ExamSessionHeader {...baseProps} mode="internal_exam" />)
    expect(screen.getByText('INTERNAL EXAM')).toBeInTheDocument()
  })

  it('renders the countdown timer with the supplied time limit', () => {
    render(<ExamSessionHeader {...baseProps} timeLimitSeconds={1800} />)
    expect(screen.getByTestId('countdown')).toHaveTextContent('1800')
  })
})
