import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StudentRow } from '../types'
import { StudentTable } from './student-table'

vi.mock('./login-instructions-cell', () => ({
  LoginInstructionsCell: () => <span>login</span>,
}))

function buildStudent(overrides: Partial<StudentRow> = {}): StudentRow {
  return {
    id: 's-1',
    email: 'a@example.com',
    full_name: 'Alice',
    role: 'student',
    organization_id: 'org-1',
    last_active_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    login_instructions_sent_at: null,
    temp_password_expires_at: null,
    ...overrides,
  }
}

function renderTable(student: StudentRow) {
  render(
    <StudentTable
      students={[student]}
      onEdit={vi.fn()}
      onToggleStatus={vi.fn()}
      onExport={vi.fn()}
    />,
  )
}

describe('StudentTable', () => {
  it('shows an active student with the success badge tone', () => {
    renderTable(buildStudent())
    const badge = screen.getByText('Active')
    expect(badge.className).toContain('bg-success-soft')
    expect(badge.className).not.toContain('bg-green-600')
  })

  it('shows a deactivated student with the destructive badge', () => {
    renderTable(buildStudent({ deleted_at: '2026-02-01T00:00:00.000Z' }))
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('pads the actions cell to a 44px tap pitch below lg and compacts it from lg', () => {
    renderTable(buildStudent({}))
    const cell = screen.getByLabelText('Edit student').closest('td')
    expect(cell?.className).toContain('py-2.5')
    expect(cell?.className).toContain('lg:py-2')
  })
})
