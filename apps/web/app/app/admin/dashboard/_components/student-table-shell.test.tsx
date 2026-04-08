import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardFilters, DashboardStudent } from '../types'

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any import that references them.
// ---------------------------------------------------------------------------

const { mockReplace, mockPush, mockUseSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockUseSearchParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: mockUseSearchParams,
}))

// Stub PaginationBar — it's a presenter, not under test here.
vi.mock('@/app/app/_components/pagination-bar', () => ({
  PaginationBar: ({ page, totalCount }: { page: number; totalCount: number }) => (
    <div data-testid="pagination" data-page={page} data-total={totalCount} />
  ),
}))

// Stub StudentStatusFilter to a simple native select so we can fire events.
// Options must be present so jsdom accepts the value on fireEvent.change.
vi.mock('./student-status-filter', () => ({
  StudentStatusFilter: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string | null) => void
  }) => (
    <select data-testid="status-filter" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">All Students</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
  ),
}))

// Stub SortableTableHead — tested separately in _lib/sortable-head.test.tsx.
vi.mock('../_lib/sortable-head', () => ({
  SortableTableHead: ({
    field,
    label,
    onSort,
  }: {
    field: string
    label: string
    activeSort: string
    activeDir: string
    onSort: (f: string) => void
  }) => (
    <th>
      <button type="button" onClick={() => onSort(field)}>
        {label}
      </button>
    </th>
  ),
}))

// Stub StudentRow — tested separately in student-table-helpers.test.tsx.
vi.mock('./student-table-helpers', () => ({
  StudentRow: ({ student, onClick }: { student: DashboardStudent; onClick: () => void }) => (
    <tr data-testid={`student-row-${student.id}`} onClick={onClick}>
      <td>{student.fullName}</td>
    </tr>
  ),
}))

import { StudentTableShell } from './student-table-shell'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_FILTERS: DashboardFilters = {
  range: '30d',
  page: 1,
  sort: 'name',
  dir: 'asc',
  status: undefined,
}

function makeStudent(overrides: Partial<DashboardStudent> = {}): DashboardStudent {
  return {
    id: 'student-1',
    fullName: 'Alice Aviator',
    email: 'alice@example.com',
    lastActiveAt: null,
    sessionCount: 5,
    avgScore: 80,
    mastery: 75,
    isActive: true,
    hasRecentActivity: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseSearchParams.mockReturnValue(new URLSearchParams())
})

// ---------------------------------------------------------------------------
// Empty-state branch: totalCount === 0
// ---------------------------------------------------------------------------

describe('StudentTableShell — empty state (totalCount is 0)', () => {
  it('renders the "No students found" message', () => {
    render(<StudentTableShell students={[]} totalCount={0} filters={BASE_FILTERS} />)
    expect(screen.getByText('No students found.')).toBeInTheDocument()
  })

  it('renders the status filter in the empty state', () => {
    render(<StudentTableShell students={[]} totalCount={0} filters={BASE_FILTERS} />)
    expect(screen.getByTestId('status-filter')).toBeInTheDocument()
  })

  it('does not render the table in the empty state', () => {
    render(<StudentTableShell students={[]} totalCount={0} filters={BASE_FILTERS} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not render pagination in the empty state', () => {
    render(<StudentTableShell students={[]} totalCount={0} filters={BASE_FILTERS} />)
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Stale-page guard: students is empty but totalCount > 0
// ---------------------------------------------------------------------------

describe('StudentTableShell — stale-page guard (students empty, totalCount > 0)', () => {
  it('renders the stale-page prompt', () => {
    render(<StudentTableShell students={[]} totalCount={5} filters={BASE_FILTERS} />)
    expect(screen.getByText(/No students on this page/)).toBeInTheDocument()
    expect(screen.getByText(/Try going back to page 1/)).toBeInTheDocument()
  })

  it('renders the status filter in the stale-page state', () => {
    render(<StudentTableShell students={[]} totalCount={5} filters={BASE_FILTERS} />)
    expect(screen.getByTestId('status-filter')).toBeInTheDocument()
  })

  it('renders pagination in the stale-page state so the user can navigate back', () => {
    render(<StudentTableShell students={[]} totalCount={5} filters={BASE_FILTERS} />)
    const pagination = screen.getByTestId('pagination')
    expect(pagination).toBeInTheDocument()
    expect(pagination).toHaveAttribute('data-total', '5')
  })

  it('does not render a table in the stale-page state', () => {
    render(<StudentTableShell students={[]} totalCount={5} filters={BASE_FILTERS} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Normal state: students present
// ---------------------------------------------------------------------------

describe('StudentTableShell — normal state (students present)', () => {
  const students = [
    makeStudent({ id: 'student-1', fullName: 'Alice Aviator' }),
    makeStudent({ id: 'student-2', fullName: 'Bob Pilot' }),
  ]

  it('renders a row for each student', () => {
    render(<StudentTableShell students={students} totalCount={2} filters={BASE_FILTERS} />)
    expect(screen.getByTestId('student-row-student-1')).toBeInTheDocument()
    expect(screen.getByTestId('student-row-student-2')).toBeInTheDocument()
  })

  it('renders the status filter', () => {
    render(<StudentTableShell students={students} totalCount={2} filters={BASE_FILTERS} />)
    expect(screen.getByTestId('status-filter')).toBeInTheDocument()
  })

  it('renders pagination', () => {
    render(<StudentTableShell students={students} totalCount={2} filters={BASE_FILTERS} />)
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// handleStatusChange
// ---------------------------------------------------------------------------

describe('StudentTableShell — handleStatusChange', () => {
  const students = [makeStudent()]

  it('removes the status param and resets page when "all" is selected', () => {
    const params = new URLSearchParams('page=2&status=active')
    mockUseSearchParams.mockReturnValue(params)
    render(<StudentTableShell students={students} totalCount={1} filters={BASE_FILTERS} />)
    fireEvent.change(screen.getByTestId('status-filter'), { target: { value: 'all' } })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const [url] = mockReplace.mock.calls[0] as [string]
    const result = new URLSearchParams(url.replace('?', ''))
    expect(result.has('status')).toBe(false)
    expect(result.has('page')).toBe(false)
  })

  it('sets the status param and removes page when a non-all value is selected', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('page=3'))
    render(<StudentTableShell students={students} totalCount={1} filters={BASE_FILTERS} />)
    fireEvent.change(screen.getByTestId('status-filter'), { target: { value: 'inactive' } })
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const [url] = mockReplace.mock.calls[0] as [string]
    const result = new URLSearchParams(url.replace('?', ''))
    expect(result.get('status')).toBe('inactive')
    expect(result.has('page')).toBe(false)
  })

  it('preserves unrelated search params when changing status', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('sort=name&dir=asc'))
    render(<StudentTableShell students={students} totalCount={1} filters={BASE_FILTERS} />)
    fireEvent.change(screen.getByTestId('status-filter'), { target: { value: 'active' } })
    const [url] = mockReplace.mock.calls[0] as [string]
    const result = new URLSearchParams(url.replace('?', ''))
    expect(result.get('sort')).toBe('name')
    expect(result.get('dir')).toBe('asc')
  })
})

// ---------------------------------------------------------------------------
// handleSort
// ---------------------------------------------------------------------------

describe('StudentTableShell — handleSort', () => {
  const students = [makeStudent()]

  it('sets sort and dir params and removes page when a column is clicked', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('page=2'))
    render(
      <StudentTableShell
        students={students}
        totalCount={1}
        filters={{ ...BASE_FILTERS, sort: 'sessions', dir: 'asc' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    const [url] = mockReplace.mock.calls[0] as [string]
    const result = new URLSearchParams(url.replace('?', ''))
    expect(result.get('sort')).toBe('name')
    expect(result.get('dir')).toBe('asc')
    expect(result.has('page')).toBe(false)
  })

  it('toggles direction to desc when clicking the currently active sort column in asc order', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    render(
      <StudentTableShell
        students={students}
        totalCount={1}
        filters={{ ...BASE_FILTERS, sort: 'name', dir: 'asc' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    const [url] = mockReplace.mock.calls[0] as [string]
    const result = new URLSearchParams(url.replace('?', ''))
    expect(result.get('sort')).toBe('name')
    expect(result.get('dir')).toBe('desc')
  })

  it('toggles direction back to asc when clicking the currently active sort column in desc order', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    render(
      <StudentTableShell
        students={students}
        totalCount={1}
        filters={{ ...BASE_FILTERS, sort: 'name', dir: 'desc' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    const [url] = mockReplace.mock.calls[0] as [string]
    const result = new URLSearchParams(url.replace('?', ''))
    expect(result.get('sort')).toBe('name')
    expect(result.get('dir')).toBe('asc')
  })
})

// ---------------------------------------------------------------------------
// Row navigation
// ---------------------------------------------------------------------------

describe('StudentTableShell — row navigation', () => {
  it('navigates to the student detail page when a row is clicked', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    const student = makeStudent({ id: 'student-42' })
    render(<StudentTableShell students={[student]} totalCount={1} filters={BASE_FILTERS} />)
    fireEvent.click(screen.getByTestId('student-row-student-42'))
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/app/admin/dashboard/students/student-42')
  })
})
