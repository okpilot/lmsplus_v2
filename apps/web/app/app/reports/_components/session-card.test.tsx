import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { SessionCard } from './session-card'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

function makeSession(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    id: 'sess-1',
    mode: 'quick_quiz',
    subjectName: 'Navigation',
    totalQuestions: 10,
    correctCount: 8,
    scorePercentage: 80,
    startedAt: '2026-03-10T10:00:00Z',
    endedAt: '2026-03-10T10:15:00Z',
    durationMinutes: 15,
    ...overrides,
  }
}

describe('SessionCard', () => {
  it('links to the quiz report page for the session', () => {
    render(<SessionCard session={makeSession({ id: 'abc-123' })} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/quiz/report?session=abc-123')
  })

  it('displays the subject name', () => {
    render(<SessionCard session={makeSession({ subjectName: 'Meteorology' })} />)
    expect(screen.getByText('Meteorology')).toBeInTheDocument()
  })

  it('displays em dash when subjectName is null', () => {
    render(<SessionCard session={makeSession({ subjectName: null })} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('displays score percentage rounded to nearest integer', () => {
    render(<SessionCard session={makeSession({ scorePercentage: 66.7 })} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('displays em dash when scorePercentage is null', () => {
    render(<SessionCard session={makeSession({ scorePercentage: null })} />)
    // The subject-name em dash and the score em dash — at least one must be present
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders the correct/total question counts', () => {
    render(<SessionCard session={makeSession({ correctCount: 7, totalQuestions: 10 })} />)
    expect(screen.getByText(/7 \/ 10/)).toBeInTheDocument()
  })

  it('displays duration in minutes when under one hour', () => {
    render(<SessionCard session={makeSession({ durationMinutes: 15 })} />)
    expect(screen.getByText(/Time: 15m/)).toBeInTheDocument()
  })

  it('displays duration with an hours unit when at or above one hour', () => {
    render(<SessionCard session={makeSession({ durationMinutes: 1629 })} />)
    expect(screen.getByText(/Time: 27h 9m/)).toBeInTheDocument()
  })

  it('displays duration at exactly one hour as "1h 0m"', () => {
    render(<SessionCard session={makeSession({ durationMinutes: 60 })} />)
    expect(screen.getByText(/Time: 1h 0m/)).toBeInTheDocument()
  })

  it('renders a Practice Exam badge for mock_exam mode', () => {
    render(<SessionCard session={makeSession({ mode: 'mock_exam' })} />)
    expect(screen.getByText('Practice Exam')).toBeInTheDocument()
  })

  it('renders an Internal Exam badge for internal_exam mode', () => {
    render(<SessionCard session={makeSession({ mode: 'internal_exam' })} />)
    expect(screen.getByText('Internal Exam')).toBeInTheDocument()
  })

  it('renders the mode label for non-exam modes', () => {
    render(<SessionCard session={makeSession({ mode: 'quick_quiz' })} />)
    expect(screen.getByText('Study')).toBeInTheDocument()
  })

  it('falls back to raw mode string for unknown modes', () => {
    render(<SessionCard session={makeSession({ mode: 'custom_mode' })} />)
    expect(screen.getByText('custom_mode')).toBeInTheDocument()
  })
})
