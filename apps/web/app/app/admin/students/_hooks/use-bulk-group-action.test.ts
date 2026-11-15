import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAdd, mockRemove, mockToast, mockRefresh } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockRemove: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockRefresh: vi.fn(),
}))

vi.mock('../actions/add-group-members', () => ({ addGroupMembers: mockAdd }))
vi.mock('../actions/remove-group-members', () => ({ removeGroupMembers: mockRemove }))
vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

import { useBulkGroupAction } from './use-bulk-group-action'

const G1 = 'a0000000-0000-4000-8000-000000000001'
const G2 = 'a0000000-0000-4000-8000-000000000002'
const IDS = ['b0000000-0000-4000-8000-000000000001']
const BOTH = [
  { id: G1, name: 'Cohort A' },
  { id: G2, name: 'Cohort B' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockAdd.mockResolvedValue({ success: true, count: 1 })
})

describe('useBulkGroupAction', () => {
  it('runs the action for a picked group that is still listed', async () => {
    const onClear = vi.fn()
    const { result } = renderHook(() =>
      useBulkGroupAction({ selectedIds: IDS, groups: BOTH, onClear }),
    )
    act(() => result.current.setPicked(G1))
    await act(async () => result.current.run('add'))
    expect(mockAdd).toHaveBeenCalledWith({ groupId: G1, userIds: IDS })
    expect(onClear).toHaveBeenCalled()
  })

  it('reads a picked group that left the list as unpicked and does not run', async () => {
    const { result, rerender } = renderHook(
      ({ groups }) => useBulkGroupAction({ selectedIds: IDS, groups, onClear: vi.fn() }),
      { initialProps: { groups: BOTH } },
    )
    act(() => result.current.setPicked(G1))
    expect(result.current.groupId).toBe(G1)
    rerender({ groups: BOTH.slice(1) })
    expect(result.current.groupId).toBe('')
    await act(async () => result.current.run('add'))
    await act(async () => result.current.run('remove'))
    expect(mockAdd).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })
})
