import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDelete } = vi.hoisted(() => ({ mockDelete: vi.fn() }))

vi.mock('../actions/delete-group', () => ({ deleteGroup: mockDelete }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

import type { GroupRow } from '../types'
import { DeleteGroupDialog } from './delete-group-dialog'

const GROUP_A: GroupRow = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Cohort A',
  description: null,
  active_count: 3,
  deactivated_count: 1,
  created_at: '2026-03-01T00:00:00Z',
}
const GROUP_B: GroupRow = {
  ...GROUP_A,
  id: 'a0000000-0000-4000-8000-000000000002',
  name: 'Cohort B',
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DeleteGroupDialog error reset', () => {
  it('clears a stale error after a failed then successful retry, for the next group', async () => {
    mockDelete.mockResolvedValueOnce({ success: false, error: 'Not authorized' })
    mockDelete.mockResolvedValueOnce({ success: true })
    const onOpenChange = vi.fn()
    const { rerender } = render(<DeleteGroupDialog group={GROUP_A} onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    expect(await screen.findByText('Not authorized')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    rerender(<DeleteGroupDialog group={null} onOpenChange={onOpenChange} />)
    rerender(<DeleteGroupDialog group={GROUP_B} onOpenChange={onOpenChange} />)
    expect(screen.getByText('Delete Cohort B?')).toBeInTheDocument()
    expect(screen.queryByText('Not authorized')).not.toBeInTheDocument()
  })
})
