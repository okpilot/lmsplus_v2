import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin, mockGetGroups } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetGroups: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('./queries', () => ({ getGroupsWithCounts: mockGetGroups }))
vi.mock('./_components/groups-table', () => ({ GroupsTable: () => <div data-testid="groups" /> }))
vi.mock('./_components/group-form-dialog', () => ({ GroupFormDialog: () => null }))

import GroupsPage from './page'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ organizationId: 'org' })
  mockGetGroups.mockResolvedValue([])
})

describe('GroupsPage', () => {
  it('calls requireAdmin exactly once, before reading groups', async () => {
    const order: string[] = []
    mockRequireAdmin.mockImplementation(async () => {
      order.push('auth')
      return { organizationId: 'org' }
    })
    mockGetGroups.mockImplementation(async () => {
      order.push('read')
      return []
    })
    render(await GroupsPage())
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1)
    expect(order[0]).toBe('auth')
  })

  it('renders a level-1 heading', async () => {
    render(await GroupsPage())
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
