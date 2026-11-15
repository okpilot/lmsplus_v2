import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./export-student-dialog', () => ({ ExportStudentDialog: () => null }))
vi.mock('./student-filters', () => ({ StudentFiltersBar: () => <div /> }))
vi.mock('./student-form-dialog', () => ({ StudentFormDialog: () => null }))
vi.mock('./student-table', () => ({ StudentTable: () => <div /> }))
vi.mock('./toggle-status-dialog', () => ({ ToggleStatusDialog: () => null }))
vi.mock('./students-bulk-bar', () => ({ StudentsBulkBar: () => null }))
vi.mock('../../../_components/pagination-bar', () => ({
  PaginationBar: () => <nav data-testid="pagination" />,
}))

import { StudentsPageShell } from './students-page-shell'

const shellProps = {
  students: [],
  courses: [],
  groups: [],
  filters: {},
  page: 2,
  totalCount: 61,
  pageSize: 25,
}

describe('StudentsPageShell groups and pagination', () => {
  it('shows the total user count, not the page row count', () => {
    render(<StudentsPageShell {...shellProps} />)
    expect(screen.getByText(/61 users?/)).toBeInTheDocument()
  })

  it('links to the groups page', () => {
    render(<StudentsPageShell {...shellProps} />)
    expect(screen.getByRole('link', { name: 'Groups' })).toHaveAttribute(
      'href',
      '/app/admin/students/groups',
    )
  })

  it('renders the pagination bar', () => {
    render(<StudentsPageShell {...shellProps} />)
    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })
})
