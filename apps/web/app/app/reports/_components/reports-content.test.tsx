import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { ReportsContent } from './reports-content'

const { mockGetAllSessions } = vi.hoisted(() => ({
  mockGetAllSessions: vi.fn(),
}))

vi.mock('@/lib/queries/reports', () => ({
  getAllSessions: (...args: unknown[]) => mockGetAllSessions(...args),
}))

// ReportsList is a client component — render a minimal stand-in
vi.mock('./reports-list', () => ({
  ReportsList: ({ sessions }: { sessions: SessionReport[] }) => (
    <div data-testid="reports-list" data-count={sessions.length} />
  ),
}))

function makeSession(id: string): SessionReport {
  return {
    id,
    mode: 'practice',
    subjectName: 'Meteorology',
    totalQuestions: 20,
    answeredCount: 20,
    correctCount: 15,
    scorePercentage: 75,
    startedAt: '2026-01-01T10:00:00Z',
    endedAt: '2026-01-01T10:20:00Z',
    durationMinutes: 20,
  }
}

describe('ReportsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows singular "session" label when exactly one session exists', async () => {
    mockGetAllSessions.mockResolvedValue([makeSession('s-1')])

    const jsx = await ReportsContent()
    render(jsx)

    expect(screen.getByText('1 completed session')).toBeInTheDocument()
  })

  it('shows plural "sessions" label when multiple sessions exist', async () => {
    mockGetAllSessions.mockResolvedValue([
      makeSession('s-1'),
      makeSession('s-2'),
      makeSession('s-3'),
    ])

    const jsx = await ReportsContent()
    render(jsx)

    expect(screen.getByText('3 completed sessions')).toBeInTheDocument()
  })

  it('shows plural "sessions" label when there are no sessions', async () => {
    mockGetAllSessions.mockResolvedValue([])

    const jsx = await ReportsContent()
    render(jsx)

    expect(screen.getByText('0 completed sessions')).toBeInTheDocument()
  })

  it('passes sessions to ReportsList', async () => {
    const sessions = [makeSession('s-1'), makeSession('s-2')]
    mockGetAllSessions.mockResolvedValue(sessions)

    const jsx = await ReportsContent()
    render(jsx)

    expect(screen.getByTestId('reports-list')).toHaveAttribute('data-count', '2')
  })
})
