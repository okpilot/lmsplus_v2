import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecentSession } from '../types'
import { RecentActivityList } from './recent-activity-list'

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

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

// formatRelativeTime is imported from student-table-helpers — stub it to keep
// tests deterministic without depending on real date arithmetic.
vi.mock('./student-table-helpers', () => ({
  formatRelativeTime: () => '5m ago',
}))

function makeSession(overrides: Partial<RecentSession> = {}): RecentSession {
  return {
    sessionId: 'sess-1',
    studentName: 'Alice',
    subjectName: 'Meteorology',
    mode: 'quick_quiz',
    scorePercentage: 80,
    endedAt: '2026-03-12T10:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('RecentActivityList', () => {
  it('shows empty-state message when sessions array is empty', () => {
    render(<RecentActivityList sessions={[]} />)
    expect(screen.getByText('No sessions yet.')).toBeInTheDocument()
  })

  it('does not render session links when sessions array is empty', () => {
    render(<RecentActivityList sessions={[]} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('renders a link for each session pointing to the correct href', () => {
    const sessions = [
      makeSession({ sessionId: 'sess-1' }),
      makeSession({ sessionId: 'sess-2', studentName: 'Bob' }),
    ]
    render(<RecentActivityList sessions={sessions} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/app/admin/dashboard/sessions/sess-1')
    expect(links[1]).toHaveAttribute('href', '/app/admin/dashboard/sessions/sess-2')
  })

  it('displays the student name', () => {
    render(<RecentActivityList sessions={[makeSession({ studentName: 'Alice' })]} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('displays "Unknown student" when studentName is null', () => {
    render(<RecentActivityList sessions={[makeSession({ studentName: null })]} />)
    expect(screen.getByText('Unknown student')).toBeInTheDocument()
  })

  it('displays the subject name', () => {
    render(<RecentActivityList sessions={[makeSession({ subjectName: 'Navigation' })]} />)
    expect(screen.getByText('Navigation')).toBeInTheDocument()
  })

  it('displays "Unknown subject" when subjectName is null', () => {
    render(<RecentActivityList sessions={[makeSession({ subjectName: null })]} />)
    expect(screen.getByText('Unknown subject')).toBeInTheDocument()
  })

  it('displays the session mode as a badge', () => {
    render(<RecentActivityList sessions={[makeSession({ mode: 'quick_quiz' })]} />)
    expect(screen.getByText('quick_quiz')).toBeInTheDocument()
  })

  it('displays the score percentage rounded when scorePercentage is a number', () => {
    render(<RecentActivityList sessions={[makeSession({ scorePercentage: 73.7 })]} />)
    expect(screen.getByText('74%')).toBeInTheDocument()
  })

  it('applies green color class for a score of 80', () => {
    render(<RecentActivityList sessions={[makeSession({ scorePercentage: 80 })]} />)
    // text-green-600 should be on the score span
    const scoreEl = screen.getByText('80%')
    expect(scoreEl.className).toContain('text-green-600')
  })

  it('applies amber color class for a score of 79', () => {
    render(<RecentActivityList sessions={[makeSession({ scorePercentage: 79 })]} />)
    const scoreEl = screen.getByText('79%')
    expect(scoreEl.className).toContain('text-amber-600')
  })

  it('applies red color class for a score below 50', () => {
    render(<RecentActivityList sessions={[makeSession({ scorePercentage: 49 })]} />)
    const scoreEl = screen.getByText('49%')
    expect(scoreEl.className).toContain('text-red-600')
  })

  it('shows a dash placeholder when scorePercentage is null', () => {
    render(<RecentActivityList sessions={[makeSession({ scorePercentage: null })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('displays the relative time from formatRelativeTime', () => {
    render(<RecentActivityList sessions={[makeSession()]} />)
    expect(screen.getByText('5m ago')).toBeInTheDocument()
  })
})
