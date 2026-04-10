import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardFilters } from '../types'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetDashboardStudents = vi.hoisted(() => vi.fn())
const mockRethrowRedirect = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getDashboardStudents: mockGetDashboardStudents,
}))

vi.mock('@/lib/next/rethrow-redirect', () => ({
  rethrowRedirect: mockRethrowRedirect,
}))

vi.mock('./student-table-shell', () => ({
  StudentTableShell: () => <div data-testid="student-table-shell" />,
}))

// ---- Subject under test -----------------------------------------------------

import { StudentTableContent } from './student-table-content'

// ---- Fixtures ---------------------------------------------------------------

const BASE_FILTERS: DashboardFilters = {
  range: '30d',
  page: 1,
  sort: 'name',
  dir: 'asc',
  status: undefined,
}

// ---- Tests ------------------------------------------------------------------

describe('StudentTableContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the table shell when data loads successfully', async () => {
    mockGetDashboardStudents.mockResolvedValue({ students: [], totalCount: 0 })

    const element = await StudentTableContent({ filters: BASE_FILTERS })
    render(element)

    expect(screen.getByTestId('student-table-shell')).toBeInTheDocument()
  })

  it('renders the error fallback when getDashboardStudents throws a regular error', async () => {
    mockGetDashboardStudents.mockRejectedValue(new Error('DB unavailable'))

    const element = await StudentTableContent({ filters: BASE_FILTERS })
    render(element)

    expect(
      screen.getByText('Failed to load students. Please refresh the page.'),
    ).toBeInTheDocument()
  })

  it('re-throws redirect errors instead of showing the fallback', async () => {
    const redirectError = new Error('NEXT_REDIRECT:/auth/login')
    mockGetDashboardStudents.mockRejectedValue(redirectError)
    mockRethrowRedirect.mockImplementation((err: unknown) => {
      throw err
    })

    await expect(StudentTableContent({ filters: BASE_FILTERS })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login',
    )
  })
})
