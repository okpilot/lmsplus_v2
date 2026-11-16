import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDelete, mockToast } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../actions/delete-group', () => ({ deleteGroup: mockDelete }))
vi.mock('sonner', () => ({ toast: mockToast }))

import type { GroupRow } from '../types'
import { useDeleteGroupDialog } from './use-delete-group-dialog'

const GROUP = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Cohort A' } as GroupRow

beforeEach(() => {
  vi.clearAllMocks()
  mockDelete.mockResolvedValue({ success: true })
})

describe('useDeleteGroupDialog', () => {
  it('deletes, toasts and closes on success', async () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useDeleteGroupDialog({ group: GROUP, onOpenChange }))
    await act(async () => result.current.handleConfirm())
    expect(mockDelete).toHaveBeenCalledWith({ groupId: GROUP.id })
    expect(mockToast.success).toHaveBeenCalledWith('Group deleted')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does nothing when no group is set', async () => {
    const { result } = renderHook(() =>
      useDeleteGroupDialog({ group: null, onOpenChange: vi.fn() }),
    )
    await act(async () => result.current.handleConfirm())
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('exposes the action error and clears it on close', async () => {
    mockDelete.mockResolvedValue({ success: false, error: 'Nope' })
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useDeleteGroupDialog({ group: GROUP, onOpenChange }))
    await act(async () => result.current.handleConfirm())
    expect(result.current.error).toBe('Nope')
    expect(onOpenChange).not.toHaveBeenCalled()
    act(() => result.current.handleOpenChange(false))
    expect(result.current.error).toBeNull()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sets a service error when the action throws', async () => {
    mockDelete.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() =>
      useDeleteGroupDialog({ group: GROUP, onOpenChange: vi.fn() }),
    )
    await act(async () => result.current.handleConfirm())
    expect(result.current.error).toBe('Service error. Please try again.')
  })
})
