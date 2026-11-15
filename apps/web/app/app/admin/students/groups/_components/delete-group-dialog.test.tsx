import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDelete, mockSuccess } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockSuccess: vi.fn(),
}))

vi.mock('../actions/delete-group', () => ({ deleteGroup: mockDelete }))
vi.mock('sonner', () => ({ toast: { success: mockSuccess } }))

import type { GroupRow } from '../types'
import { DeleteGroupDialog } from './delete-group-dialog'

const GROUP: GroupRow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Cohort A',
  description: null,
  member_count: 3,
  created_at: '2026-03-01T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DeleteGroupDialog', () => {
  it('renders nothing when no group is selected', () => {
    render(<DeleteGroupDialog group={null} onOpenChange={vi.fn()} />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('deletes the group, toasts and closes on confirm', async () => {
    mockDelete.mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()
    render(<DeleteGroupDialog group={GROUP} onOpenChange={onOpenChange} />)
    expect(screen.getByText('Delete Cohort A?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith({ groupId: GROUP.id }))
    expect(mockSuccess).toHaveBeenCalledWith('Group deleted')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the server error and stays open on failure', async () => {
    mockDelete.mockResolvedValue({ success: false, error: 'Not authorized' })
    const onOpenChange = vi.fn()
    render(<DeleteGroupDialog group={GROUP} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    expect(await screen.findByText('Not authorized')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('shows a service error when the action throws', async () => {
    mockDelete.mockRejectedValue(new Error('boom'))
    render(<DeleteGroupDialog group={GROUP} onOpenChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    expect(await screen.findByText('Service error. Please try again.')).toBeInTheDocument()
  })
})
