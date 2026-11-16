import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('../actions/delete-group', () => ({ deleteGroup: vi.fn() }))
vi.mock('../actions/update-group', () => ({ updateGroup: vi.fn() }))
vi.mock('../actions/create-group', () => ({ createGroup: vi.fn() }))

import { GroupsTable } from './groups-table'

const G1 = 'a0000000-0000-4000-8000-000000000001'
const GROUPS = [
  {
    id: G1,
    name: 'Cohort A',
    description: 'Spring intake',
    active_count: 7,
    deactivated_count: 3,
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    name: 'Cohort B',
    description: null,
    active_count: 0,
    deactivated_count: 0,
    created_at: '2026-03-02T00:00:00Z',
  },
]

describe('GroupsTable', () => {
  it('lists name, description, active, deactivated and created columns', () => {
    render(<GroupsTable groups={GROUPS} />)
    for (const h of ['Name', 'Description', 'Active', 'Deactivated', 'Created']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(h) })).toBeInTheDocument()
    }
    const r = screen.getByText('Cohort A').closest('tr') as HTMLElement
    expect(within(r).getByText('Spring intake')).toBeInTheDocument()
    expect(within(r).getByText('7')).toBeInTheDocument()
    expect(within(r).getByText('3')).toBeInTheDocument()
  })

  it('links "View students" to the students page filtered by the group', () => {
    render(<GroupsTable groups={GROUPS} />)
    const r = screen.getByText('Cohort A').closest('tr') as HTMLElement
    expect(within(r).getByRole('link', { name: /View students/ })).toHaveAttribute(
      'href',
      `/app/admin/students?group=${G1}&status=active&role=student`,
    )
  })
})
