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
    ...over,
  }
}

function renderTable(students: StudentRow[]) {
  return render(
    <StudentTable
      students={students}
      courses={COURSES}
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

  it('shows one badge per active course using the short name', () => {
    renderTable([row({ course_ids: [RT, ATPL] })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(within(r).getByText('RT')).toBeInTheDocument()
    expect(within(r).getByText('ATPL')).toBeInTheDocument()
    expect(within(r).queryByText('PPL')).not.toBeInTheDocument()
  })

  it('shows an em dash for a student with no courses', () => {
    renderTable([row({ course_ids: [] })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(within(r).getByText('—')).toBeInTheDocument()
  })

  it.each(['instructor', 'admin'] as const)('shows course badges for role %s', (role) => {
    renderTable([row({ role, course_ids: [PPL] })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    expect(within(r).getByText('PPL')).toBeInTheDocument()
  })
})
