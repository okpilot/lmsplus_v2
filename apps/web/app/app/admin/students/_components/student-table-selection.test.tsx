import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StudentRow } from '../types'
import { StudentTable } from './student-table'

vi.mock('./login-instructions-cell', () => ({ LoginInstructionsCell: () => null }))

const G1 = 'a0000000-0000-4000-8000-000000000001'
const GROUPS = [{ id: G1, name: 'Cohort A' }]

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

function renderTable(students: StudentRow[], over: Record<string, unknown> = {}) {
  const props = {
    students,
    courses: [],
    groups: GROUPS,
    selectedIds: [] as string[],
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    onEdit: vi.fn(),
    onToggleStatus: vi.fn(),
    onExport: vi.fn(),
    ...over,
  }
  render(<StudentTable {...(props as React.ComponentProps<typeof StudentTable>)} />)
  return props
}

describe('StudentTable selection and groups', () => {
  it('renders a select-all checkbox labelled "Select all students on this page"', () => {
    renderTable([row({})])
    expect(
      screen.getByRole('checkbox', { name: 'Select all students on this page' }),
    ).toBeInTheDocument()
  })

  it('gives active students a checkbox and inactive or non-student rows none', () => {
    renderTable([
      row({ id: 's1', full_name: 'Alice' }),
      row({ id: 's2', full_name: 'Bob', deleted_at: '2026-02-01T00:00:00Z' }),
      row({ id: 's3', full_name: 'Cara', role: 'instructor' }),
    ])
    const inRow = (name: string) =>
      within(screen.getByText(name).closest('tr') as HTMLElement).queryAllByRole('checkbox')
    expect(inRow('Alice')).toHaveLength(1)
    expect(inRow('Bob')).toHaveLength(0)
    expect(inRow('Cara')).toHaveLength(0)
  })

  it('calls onToggle with the row id when its checkbox is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const props = renderTable([row({ id: 's1' })])
    const r = screen.getByText('Alice').closest('tr') as HTMLElement
    await user.click(within(r).getByRole('checkbox'))
    expect(props.onToggle).toHaveBeenCalledWith('s1')
  })

  it('calls onToggleAll when select-all is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    const props = renderTable([row({})])
    await user.click(screen.getByRole('checkbox', { name: 'Select all students on this page' }))
    expect(props.onToggleAll).toHaveBeenCalled()
  })

  it('disables select-all when the page has no selectable rows', () => {
    renderTable([row({ deleted_at: '2026-02-01T00:00:00Z' })])
    expect(
      screen.getByRole('checkbox', { name: 'Select all students on this page' }),
    ).toBeDisabled()
  })

  it('shows group badges, or an em dash when the student has no group', () => {
    renderTable([
      row({ id: 's1', full_name: 'Alice', group_ids: [G1] }),
      row({ id: 's2', full_name: 'Bob', group_ids: [] }),
    ])
    expect(screen.getByRole('columnheader', { name: 'Groups' })).toBeInTheDocument()
    const a = screen.getByText('Alice').closest('tr') as HTMLElement
    const b = screen.getByText('Bob').closest('tr') as HTMLElement
    expect(within(a).getByText('Cohort A')).toBeInTheDocument()
    expect(within(b).queryByText('Cohort A')).not.toBeInTheDocument()
  })
})
