import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate, mockUpdate, mockSuccess, mockError } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockSuccess: vi.fn(),
  mockError: vi.fn(),
}))

vi.mock('../actions/create-group', () => ({ createGroup: mockCreate }))
vi.mock('../actions/update-group', () => ({ updateGroup: mockUpdate }))
vi.mock('sonner', () => ({ toast: { success: mockSuccess, error: mockError } }))

import type { GroupRow } from '../types'
import { GroupFormDialog } from './group-form-dialog'

const GROUP: GroupRow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Cohort A',
  description: 'Spring',
  member_count: 3,
  created_at: '2026-03-01T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GroupFormDialog', () => {
  it('disables Create Group while the name is blank', () => {
    render(<GroupFormDialog open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Create Group' })).toBeDisabled()
  })

  it('omits a blank description when creating', async () => {
    mockCreate.mockResolvedValue({ success: true })
    const onOpenChange = vi.fn()
    render(<GroupFormDialog open onOpenChange={onOpenChange} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Cohort B')
    await userEvent.type(screen.getByLabelText('Description'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Create Group' }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ name: 'Cohort B' }))
    expect(mockSuccess).toHaveBeenCalledWith('Group created')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('updates an existing group with its id and prefilled values', async () => {
    mockUpdate.mockResolvedValue({ success: true })
    render(<GroupFormDialog group={GROUP} open onOpenChange={vi.fn()} />)
    expect(screen.getByLabelText('Name')).toHaveValue('Cohort A')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({
        groupId: GROUP.id,
        name: 'Cohort A',
        description: 'Spring',
      }),
    )
    expect(mockSuccess).toHaveBeenCalledWith('Group updated')
  })

  it('shows the server error and stays open when the action fails', async () => {
    mockCreate.mockResolvedValue({ success: false, error: 'A group with this name already exists' })
    const onOpenChange = vi.fn()
    render(<GroupFormDialog open onOpenChange={onOpenChange} />)
    await userEvent.type(screen.getByLabelText('Name'), 'Dup')
    await userEvent.click(screen.getByRole('button', { name: 'Create Group' }))
    await waitFor(() =>
      expect(mockError).toHaveBeenCalledWith('A group with this name already exists'),
    )
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('shows a service error when the action throws', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    render(<GroupFormDialog open onOpenChange={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Name'), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Create Group' }))
    await waitFor(() => expect(mockError).toHaveBeenCalledWith('Service error. Please try again.'))
  })
})
