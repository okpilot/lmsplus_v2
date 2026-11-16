import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetGroups } = vi.hoisted(() => ({ mockGetGroups: vi.fn() }))

vi.mock('../queries', () => ({ getGroupsWithCounts: mockGetGroups }))
vi.mock('./groups-table', () => ({ GroupsTable: () => <div data-testid="groups-table" /> }))
vi.mock('./group-form-dialog', () => ({
  GroupFormDialog: ({ trigger }: { trigger?: React.ReactNode }) => <div>{trigger}</div>,
}))

import { GroupsPanel } from './groups-panel'

const G = (id: string) => ({
  id,
  name: id,
  description: null,
  active_count: 0,
  deactivated_count: 0,
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GroupsPanel', () => {
  it('AC4: shows the plural group count caption', async () => {
    mockGetGroups.mockResolvedValue([G('a'), G('b')])
    render(await GroupsPanel())
    expect(screen.getByText(/2 groups/)).toBeInTheDocument()
  })

  it('AC4: shows the singular caption for one group', async () => {
    mockGetGroups.mockResolvedValue([G('a')])
    render(await GroupsPanel())
    expect(screen.getByText(/1 group(?!s)/)).toBeInTheDocument()
  })

  it('AC4: renders the GroupsTable', async () => {
    mockGetGroups.mockResolvedValue([])
    render(await GroupsPanel())
    expect(screen.getByTestId('groups-table')).toBeInTheDocument()
  })

  it('AC4: renders a New Group button', async () => {
    mockGetGroups.mockResolvedValue([])
    render(await GroupsPanel())
    expect(screen.getByRole('button', { name: /New Group/ })).toBeInTheDocument()
  })

  it('shows the failure alert and no table when the fetch rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetGroups.mockRejectedValue(new Error('db down'))
    render(await GroupsPanel())
    expect(screen.getByText('Failed to load groups. Please refresh the page.')).toBeInTheDocument()
    expect(screen.queryByTestId('groups-table')).not.toBeInTheDocument()
  })

  it('rethrows a Next redirect error and renders no alert', async () => {
    let redirectError: unknown
    try {
      redirect('/x')
    } catch (error) {
      redirectError = error
    }
    mockGetGroups.mockRejectedValue(redirectError)
    await expect(GroupsPanel()).rejects.toBe(redirectError)
    expect(screen.queryByText(/Failed to load groups/)).not.toBeInTheDocument()
  })
})
