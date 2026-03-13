import type { RecentSession } from '@/lib/queries/dashboard'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecentSessions } from './recent-sessions'

function makeSession(overrides: Partial<RecentSession> = {}): RecentSession {
  return {
    id: 'sess-1',
    mode: 'quick_quiz',
    subjectName: 'Aircraft General Knowledge',
    totalQuestions: 10,
    correctCount: 8,
    scorePercentage: 80,
    startedAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
    ...overrides,
  }
}

describe('RecentSessions', () => {
  it('shows empty state message when sessions array is empty', () => {
    render(<RecentSessions sessions={[]} />)
    expect(screen.getByText(/no sessions yet\. start a quiz/i)).toBeInTheDocument()
  })

  it('renders a row for each session', () => {
    const sessions = [
      makeSession({ id: 's1', correctCount: 8 }),
      makeSession({ id: 's2', correctCount: 5 }),
    ]
    render(<RecentSessions sessions={sessions} />)
    // Both rows show score percentage
    expect(screen.getAllByText('80%')).toHaveLength(2)
  })

  it('displays the score percentage rounded', () => {
    render(<RecentSessions sessions={[makeSession({ scorePercentage: 66.7 })]} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('displays "—" when scorePercentage is null', () => {
    render(<RecentSessions sessions={[makeSession({ scorePercentage: null })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows subject name in the row label for quick_quiz', () => {
    render(
      <RecentSessions
        sessions={[makeSession({ mode: 'quick_quiz', subjectName: 'Meteorology' })]}
      />,
    )
    expect(screen.getByText(/Quiz — Meteorology/)).toBeInTheDocument()
  })

  it('shows mode label without subject name when subjectName is null', () => {
    render(<RecentSessions sessions={[makeSession({ subjectName: null })]} />)
    expect(screen.getByText('Quiz')).toBeInTheDocument()
  })

  it('shows raw mode string for unknown modes', () => {
    render(<RecentSessions sessions={[makeSession({ mode: 'custom_mode', subjectName: null })]} />)
    expect(screen.getByText('custom_mode')).toBeInTheDocument()
  })

  it('shows correct/total answer counts', () => {
    render(<RecentSessions sessions={[makeSession({ correctCount: 7, totalQuestions: 10 })]} />)
    expect(screen.getByText(/7\/10 correct/)).toBeInTheDocument()
  })
})

describe('formatTimeAgo (via RecentSessions)', () => {
  it('shows "just now" for sessions less than a minute ago', () => {
    const session = makeSession({ startedAt: new Date(Date.now() - 30 * 1000).toISOString() })
    render(<RecentSessions sessions={[session]} />)
    expect(screen.getByText(/just now/)).toBeInTheDocument()
  })

  it('shows minutes ago for sessions within the last hour', () => {
    const session = makeSession({ startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() })
    render(<RecentSessions sessions={[session]} />)
    expect(screen.getByText(/5m ago/)).toBeInTheDocument()
  })

  it('shows hours ago for sessions earlier today', () => {
    const session = makeSession({
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    })
    render(<RecentSessions sessions={[session]} />)
    expect(screen.getByText(/3h ago/)).toBeInTheDocument()
  })

  it('shows days ago for sessions within the last week', () => {
    const session = makeSession({
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    render(<RecentSessions sessions={[session]} />)
    expect(screen.getByText(/2d ago/)).toBeInTheDocument()
  })

  it('shows locale date string for sessions older than a week', () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    const session = makeSession({ startedAt: oldDate.toISOString() })
    render(<RecentSessions sessions={[session]} />)
    const dateString = oldDate.toLocaleDateString()
    // The date string appears inside a paragraph alongside "X/Y correct · "
    // Use a function matcher to locate it within the rendered text content
    expect(
      screen.getByText((_, element) => {
        return element?.tagName === 'P' && (element.textContent ?? '').includes(dateString)
      }),
    ).toBeInTheDocument()
  })
})
