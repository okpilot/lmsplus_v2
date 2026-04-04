import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionReport } from '@/lib/queries/reports'
import { ReportsContent } from './reports-content'

const { mockGetSessionReports, mockRedirect } = vi.hoisted(() => ({
  mockGetSessionReports: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/queries/reports', () => ({
  getSessionReports: (...args: unknown[]) => mockGetSessionReports(...args),
  PAGE_SIZE: 10,
}))

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}))

// ReportsList is a client component — render a minimal stand-in
vi.mock('./reports-list', () => ({
  ReportsList: ({ sessions, totalCount }: { sessions: SessionReport[]; totalCount: number }) => (
    <div data-testid="reports-list" data-count={sessions.length} data-total={totalCount} />
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

const DEFAULT_PROPS = { page: 1, sort: 'date' as const, dir: 'desc' as const }

describe('ReportsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows singular "session" label when exactly one session exists', async () => {
    mockGetSessionReports.mockResolvedValue({
      ok: true,
      sessions: [makeSession('s-1')],
      totalCount: 1,
    })

    const jsx = await ReportsContent(DEFAULT_PROPS)
    render(jsx)

    expect(screen.getByText('1 completed session')).toBeInTheDocument()
  })

  it('shows plural "sessions" label when multiple sessions exist', async () => {
    mockGetSessionReports.mockResolvedValue({
      ok: true,
      sessions: [makeSession('s-1'), makeSession('s-2'), makeSession('s-3')],
      totalCount: 3,
    })

    const jsx = await ReportsContent(DEFAULT_PROPS)
    render(jsx)

    expect(screen.getByText('3 completed sessions')).toBeInTheDocument()
  })

  it('shows plural "sessions" label when there are no sessions', async () => {
    mockGetSessionReports.mockResolvedValue({ ok: true, sessions: [], totalCount: 0 })

    const jsx = await ReportsContent(DEFAULT_PROPS)
    render(jsx)

    expect(screen.getByText('0 completed sessions')).toBeInTheDocument()
  })

  it('passes sessions to ReportsList', async () => {
    const sessions = [makeSession('s-1'), makeSession('s-2')]
    mockGetSessionReports.mockResolvedValue({ ok: true, sessions, totalCount: 2 })

    const jsx = await ReportsContent(DEFAULT_PROPS)
    render(jsx)

    expect(screen.getByTestId('reports-list')).toHaveAttribute('data-count', '2')
  })

  it('renders error state when query returns ok: false', async () => {
    mockGetSessionReports.mockResolvedValue({ ok: false, error: 'Failed to load reports' })

    const jsx = await ReportsContent(DEFAULT_PROPS)
    render(jsx)

    expect(screen.getByText(/failed to load reports/i)).toBeInTheDocument()
  })

  it('passes totalCount through to ReportsList', async () => {
    mockGetSessionReports.mockResolvedValue({
      ok: true,
      sessions: [makeSession('s-1')],
      totalCount: 42,
    })

    const jsx = await ReportsContent(DEFAULT_PROPS)
    render(jsx)

    expect(screen.getByTestId('reports-list')).toHaveAttribute('data-total', '42')
  })

  it('redirects to last valid page when requested page exceeds total pages', async () => {
    // totalCount=5, PAGE_SIZE=10 → totalPages=1; page=3 exceeds it
    mockGetSessionReports.mockResolvedValue({
      ok: true,
      sessions: [makeSession('s-1')],
      totalCount: 5,
    })

    await ReportsContent({ page: 3, sort: 'date', dir: 'desc' })

    // totalPages=1 → redirect to /app/reports (no query string needed for defaults)
    expect(mockRedirect).toHaveBeenCalledWith('/app/reports')
  })

  it('redirects and preserves non-default sort params when page is out of range', async () => {
    // totalCount=25, PAGE_SIZE=10 → totalPages=3; page=5 exceeds it
    mockGetSessionReports.mockResolvedValue({
      ok: true,
      sessions: [makeSession('s-1')],
      totalCount: 25,
    })

    await ReportsContent({ page: 5, sort: 'score', dir: 'asc' })

    // totalPages=3 → redirect to page=3 with non-default sort/dir params preserved
    expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('sort=score'))
    expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('dir=asc'))
    expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('page=3'))
  })
})
