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
  it('does not read groups until requireAdmin has resolved', async () => {
    let authorize: (v: { organizationId: string }) => void = () => {}
    mockRequireAdmin.mockReturnValue(
      new Promise((resolve) => {
        authorize = resolve
      }),
    )
    const pending = GroupsPage()
    await new Promise((r) => setTimeout(r, 0))
    expect(mockRequireAdmin).toHaveBeenCalledTimes(1)
    expect(mockGetGroups).not.toHaveBeenCalled()

    authorize({ organizationId: 'org' })
    render(await pending)
    expect(mockGetGroups).toHaveBeenCalledTimes(1)
  })

  it('rejects without reading groups when requireAdmin rejects', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('forbidden'))
    await expect(GroupsPage()).rejects.toThrow('forbidden')
    expect(mockGetGroups).not.toHaveBeenCalled()
  })

  it('renders a level-1 heading', async () => {
    render(await GroupsPage())
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})
