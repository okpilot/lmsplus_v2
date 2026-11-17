import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CourseOption, StudentRow } from '../types'
import { StudentTable } from './student-table'

vi.mock('./login-instructions-cell', () => ({ LoginInstructionsCell: () => null }))

const PPL = 'c0a5e000-0000-4000-8000-000000000001'
const RT = 'c0a5e000-0000-4000-8000-000000000002'
const ATPL = 'c0a5e000-0000-4000-8000-000000000003'

const COURSES: CourseOption[] = [
  { id: PPL, short: 'PPL', name: 'PPL(A)' },
  { id: RT, short: 'RT', name: 'VFR RT' },
  { id: ATPL, short: 'ATPL', name: 'ATPL(A)' },
]

function row(over: Partial<StudentRow>): StudentRow {
  return {
    id: 's1',
    email: 'a@example.com',
    full_name: 'Alice',
    role: 'student',
    organization_id: 'org-1',
    last_active_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    login_instructions_sent_at: null,
    temp_password_expires_at: null,
    course_ids: [],
    group_ids: [],
    ...over,
  }
}

function renderTable(students: StudentRow[]) {
  return render(
    <StudentTable
      students={students}
      courses={COURSES}
      groups={[]}
      selectedIds={[]}
      onToggle={vi.fn()}
      onToggleAll={vi.fn()}
      onEdit={vi.fn()}
      onToggleStatus={vi.fn()}
      onExport={vi.fn()}
    />,
  )
}

describe('StudentTable — courses column', () => {
  it('has a Courses column header', () => {
    renderTable([row({})])
    expect(screen.getByRole('columnheader', { name: 'Courses' })).toBeInTheDocument()
  })

  it('lists the active courses as one comma-joined text using the short names', () => {
    renderTable([row({ course_ids: [RT, ATPL] })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(within(r).getByText(/\bRT\b/)).toBeInTheDocument()
    expect(within(r).getByText(/\bATPL\b/)).toBeInTheDocument()
    expect(within(r).queryByText(/\bPPL\b/)).not.toBeInTheDocument()
  })

  it('lets the tag cell wrap', () => {
    renderTable([row({ course_ids: [RT, ATPL] })])
    const cell = screen.getByText(/\bRT\b/).closest('td') as HTMLElement
    expect(cell).toHaveClass('whitespace-normal')
  })

  it('shows an em dash for a student with no courses', () => {
    renderTable([row({ course_ids: [] })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    // cells: checkbox, name, email, role, courses
    expect(
      within(within(r).getAllByRole('cell')[4] as HTMLElement).getByText('—'),
    ).toBeInTheDocument()
  })

  it.each(['instructor', 'admin'] as const)('shows course text for role %s', (role) => {
    renderTable([row({ role, course_ids: [PPL] })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(within(r).getByText('PPL')).toBeInTheDocument()
  })
})

describe('StudentTable — role text', () => {
  it.each(['admin', 'student', 'instructor'] as const)(
    'shows the %s role as plain text',
    (role) => {
      renderTable([row({ role })])
      const el = screen.getByText(role)
      expect(el.className).not.toContain('bg-')
      expect(el.className).toContain('capitalize')
    },
  )
})

describe('StudentTable — status and actions', () => {
  it('shows an active student as plain text', () => {
    renderTable([row({})])
    expect(screen.getByText('Active').closest('td')?.className).not.toContain('bg-')
    expect(screen.queryByText('Inactive')).toBeNull()
  })

  it('shows Inactive as muted text', () => {
    renderTable([row({ deleted_at: '2026-02-01T00:00:00.000Z' })])
    const el = screen.getByText('Inactive')
    expect(el).toHaveClass('text-muted-foreground')
    expect(el.className).not.toContain('bg-')
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('takes the actions cell padding from the table primitive', () => {
    renderTable([row({})])
    const cell = screen.getByLabelText('Edit student').closest('td')
    expect(cell?.className).toContain('py-cell-y')
    expect(cell?.className).not.toContain('py-2.5')
  })
})

describe('StudentTable — UTC date columns', () => {
  it('labels the date column headers (UTC)', () => {
    renderTable([row({})])
    expect(screen.getByRole('columnheader', { name: 'Last Active (UTC)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Created (UTC)' })).toBeInTheDocument()
  })

  it('renders date cells without a UTC label', () => {
    renderTable([
      row({ last_active_at: '2026-03-15T23:30:00Z', created_at: '2026-01-05T00:00:00Z' }),
    ])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(r.textContent).toContain('2026')
    expect(r.textContent).not.toContain('UTC')
  })
})
