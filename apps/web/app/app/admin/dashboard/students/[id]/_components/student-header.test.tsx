import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentDetail } from '../../../types'

beforeEach(() => {
  vi.resetAllMocks()
})

// Stub next/link — we only care about rendered text/href, not routing.
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

// formatRelativeTime is used by StudentHeader via student-table-helpers.
// Stub it to a deterministic string so tests aren't time-dependent.
vi.mock('../../../_components/student-table-helpers', () => ({
  formatRelativeTime: () => '2d ago',
}))

import { StudentHeader } from './student-header'

function makeStudent(overrides: Partial<StudentDetail> = {}): StudentDetail {
  return {
    id: 'stu-1',
    fullName: 'Alice Aviator',
    email: 'alice@example.com',
    role: 'student',
    lastActiveAt: '2026-04-06T10:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    deletedAt: null,
    courses: [],
    ...overrides,
  }
}

describe('StudentHeader', () => {
  it('renders the student full name in the heading and email below it', () => {
    render(<StudentHeader student={makeStudent()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alice Aviator')
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('renders the student name as a page title', () => {
    render(<StudentHeader student={makeStudent()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-title')
  })

  it('renders "Unnamed Student" as the heading when fullName is null', () => {
    render(<StudentHeader student={makeStudent({ fullName: null })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Unnamed Student')
  })

  it('renders the breadcrumb "Student" label when fullName is null', () => {
    render(<StudentHeader student={makeStudent({ fullName: null })} />)
    expect(screen.getAllByText('Student').length).toBeGreaterThanOrEqual(1)
  })

  it('renders courses, role and status as one plain attribute line', () => {
    render(
      <StudentHeader
        student={makeStudent({ courses: ['PPL', 'RT'], role: 'student', deletedAt: null })}
      />,
    )
    expect(screen.getByText('PPL, RT · Student')).toBeInTheDocument()
  })

  it('shows the instructor role in the attribute line', () => {
    render(<StudentHeader student={makeStudent({ role: 'instructor' })} />)
    expect(screen.getByText('Instructor')).toBeInTheDocument()
  })

  it('shows the admin role in the attribute line', () => {
    render(<StudentHeader student={makeStudent({ role: 'admin' })} />)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('appends Inactive to the attribute line when deletedAt is set', () => {
    render(
      <StudentHeader
        student={makeStudent({ deletedAt: '2026-03-15T12:00:00Z', courses: ['PPL'] })}
      />,
    )
    expect(screen.getByText('PPL · Student · Inactive')).toBeInTheDocument()
  })

  it('omits Inactive when deletedAt is null', () => {
    render(<StudentHeader student={makeStudent({ deletedAt: null })} />)
    expect(screen.queryByText(/Inactive/)).not.toBeInTheDocument()
  })

  it('renders a Dashboard breadcrumb link', () => {
    render(<StudentHeader student={makeStudent()} />)
    const link = screen.getByRole('link', { name: 'Dashboard' })
    expect(link).toHaveAttribute('href', '/app/admin/dashboard')
  })

  it('renders the last-active label', () => {
    render(<StudentHeader student={makeStudent()} />)
    expect(screen.getByText(/Last active:/)).toBeInTheDocument()
  })
})
