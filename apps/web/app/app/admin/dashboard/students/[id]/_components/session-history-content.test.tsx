import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentSessionFilters } from '../../../types'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetStudentSessions = vi.hoisted(() => vi.fn())
const mockRethrowRedirect = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getStudentSessions: mockGetStudentSessions,
}))

vi.mock('@/lib/next/rethrow-redirect', () => ({
  rethrowRedirect: mockRethrowRedirect,
}))

vi.mock('./session-history-table', () => ({
  SessionHistoryTable: () => <div data-testid="session-history-table" />,
}))

// ---- Subject under test -----------------------------------------------------

import { SessionHistoryContent } from './session-history-content'

// ---- Fixtures ---------------------------------------------------------------

const BASE_FILTERS: StudentSessionFilters = {
  range: 'all',
  page: 1,
  sort: 'date',
  dir: 'desc',
}

// ---- Tests ------------------------------------------------------------------

describe('SessionHistoryContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the session history table when data loads successfully', async () => {
    mockGetStudentSessions.mockResolvedValue({ sessions: [], totalCount: 0 })

    const element = await SessionHistoryContent({ studentId: 'stu-1', filters: BASE_FILTERS })
    render(element)

    expect(screen.getByTestId('session-history-table')).toBeInTheDocument()
  })

  it('renders the error fallback when getStudentSessions throws a regular error', async () => {
    mockGetStudentSessions.mockRejectedValue(new Error('network error'))

    const element = await SessionHistoryContent({ studentId: 'stu-1', filters: BASE_FILTERS })
    render(element)

    expect(
      screen.getByText('Failed to load session history. Please refresh the page.'),
    ).toBeInTheDocument()
  })

  it('re-throws redirect errors instead of showing the fallback', async () => {
    const redirectError = new Error('NEXT_REDIRECT:/auth/login')
    mockGetStudentSessions.mockRejectedValue(redirectError)
    mockRethrowRedirect.mockImplementation((err: unknown) => {
      throw err
    })

    await expect(
      SessionHistoryContent({ studentId: 'stu-1', filters: BASE_FILTERS }),
    ).rejects.toThrow('NEXT_REDIRECT:/auth/login')
  })
})
