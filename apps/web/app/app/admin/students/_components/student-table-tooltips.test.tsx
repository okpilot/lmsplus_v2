import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StudentRow } from '../types'
import { StudentTable } from './student-table'

vi.mock('./login-instructions-cell', () => ({ LoginInstructionsCell: () => null }))

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

function renderTable(s: StudentRow) {
  return render(
    <StudentTable
      students={[s]}
      courses={[]}
      onEdit={vi.fn()}
      onToggleStatus={vi.fn()}
      onExport={vi.fn()}
    />,
  )
}

const CASES: [string, Partial<StudentRow>][] = [
  ['Edit student', {}],
  ['Deactivate student', {}],
  ['Reactivate student', { deleted_at: '2026-02-01T00:00:00.000Z' }],
  ['Export data', {}],
]

describe('StudentTable icon-button tooltips', () => {
  it.each(CASES)(
    '"%s" shows a tooltip after hover and keeps aria-label, no title',
    async (name, over) => {
      renderTable(row(over))
      const btn = screen.getByRole('button', { name })
      expect(btn).not.toHaveAttribute('title')
      await userEvent.setup().hover(btn)
      const tip = await screen.findByRole('tooltip', {}, { timeout: 1500 })
      expect(tip).toHaveTextContent(name)
    },
  )

  it('shows no tooltip on touch pointer', async () => {
    renderTable(row({}))
    const btn = screen.getByRole('button', { name: 'Edit student' })
    await userEvent.setup().pointer({ keys: '[TouchA]', target: btn })
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
