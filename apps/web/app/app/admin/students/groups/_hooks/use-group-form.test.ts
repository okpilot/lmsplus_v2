import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreate, mockUpdate, mockToast } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../actions/create-group', () => ({ createGroup: mockCreate }))
vi.mock('../actions/update-group', () => ({ updateGroup: mockUpdate }))
vi.mock('sonner', () => ({ toast: mockToast }))

import type { GroupRow } from '../types'
import { useGroupForm } from './use-group-form'

const GROUP = {
  id: 'a0000000-0000-4000-8000-000000000001',
  name: 'Cohort A',
  description: 'Old',
} as GroupRow

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ success: true })
  mockUpdate.mockResolvedValue({ success: true })
})

describe('useGroupForm', () => {
  it('creates without a blank description and closes', async () => {
    const { result } = renderHook(() => useGroupForm({}))
    act(() => result.current.handleOpenChange(true))
    expect(result.current.open).toBe(true)
    act(() => result.current.setName('New'))
    act(() => result.current.setDescription('   '))
    await act(async () => result.current.handleSubmit())
    expect(mockCreate).toHaveBeenCalledWith({ name: 'New' })
    expect(mockToast.success).toHaveBeenCalledWith('Group created')
    expect(result.current.open).toBe(false)
  })

  it('updates an existing group with prefilled values', async () => {
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useGroupForm({ group: GROUP, open: true, onOpenChange }))
    expect(result.current.name).toBe('Cohort A')
    await act(async () => result.current.handleSubmit())
    expect(mockUpdate).toHaveBeenCalledWith({
      groupId: GROUP.id,
      name: 'Cohort A',
      description: 'Old',
    })
    expect(mockToast.success).toHaveBeenCalledWith('Group updated')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('toasts the action error and stays open', async () => {
    mockCreate.mockResolvedValue({ success: false, error: 'Taken' })
    const { result } = renderHook(() => useGroupForm({}))
    act(() => result.current.handleOpenChange(true))
    await act(async () => result.current.handleSubmit())
    expect(mockToast.error).toHaveBeenCalledWith('Taken')
    expect(result.current.open).toBe(true)
  })

  it('toasts a service error when the action throws', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useGroupForm({}))
    await act(async () => result.current.handleSubmit())
    expect(mockToast.error).toHaveBeenCalledWith('Service error. Please try again.')
  })

  it('resets fields from the group when reopened', () => {
    const { result } = renderHook(() => useGroupForm({ group: GROUP }))
    act(() => result.current.setName('Edited'))
    act(() => result.current.handleOpenChange(true))
    expect(result.current.name).toBe('Cohort A')
  })
})
