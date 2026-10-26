import { render, screen } from '@testing-library/react'
import { notFound, redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardFilters } from '../types'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetDashboardStudents = vi.hoisted(() => vi.fn())
// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getDashboardStudents: mockGetDashboardStudents,
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

  it('propagates a redirect() navigation error instead of showing the fallback', async () => {
    const error = capture(() => redirect('/auth/login'))
    mockGetDashboardStudents.mockRejectedValue(error)

    await expect(StudentTableContent({ filters: BASE_FILTERS })).rejects.toBe(error)
  })

  it('propagates a notFound() navigation error instead of showing the fallback', async () => {
    const error = capture(() => notFound())
    mockGetDashboardStudents.mockRejectedValue(error)

    await expect(StudentTableContent({ filters: BASE_FILTERS })).rejects.toBe(error)
  })
})

function capture(fn: () => never): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('navigation helper did not throw')
}
