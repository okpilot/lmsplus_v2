import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./export-student-dialog', () => ({ ExportStudentDialog: () => null }))
vi.mock('./student-filters', () => ({ StudentFiltersBar: () => <div /> }))
vi.mock('./student-form-dialog', () => ({ StudentFormDialog: () => null }))
vi.mock('./student-table', () => ({ StudentTable: () => <div /> }))
vi.mock('./toggle-status-dialog', () => ({ ToggleStatusDialog: () => null }))

import { StudentsPageShell } from './students-page-shell'

describe('StudentsPageShell', () => {
  it('shows the no-results message in the shared empty part', () => {
    const { container } = render(<StudentsPageShell students={[]} filters={{}} />)
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent(
      'No students found. Adjust filters or create a new student.',
    )
  })
})
