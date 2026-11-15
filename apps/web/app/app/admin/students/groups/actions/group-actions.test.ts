import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRevalidatePath, mockRpc, mockRequireAdmin } = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { createGroup } from './create-group'
import { deleteGroup } from './delete-group'
import { updateGroup } from './update-group'

const GROUP = 'a0000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ supabase: { rpc: mockRpc }, organizationId: 'org' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createGroup', () => {
  it('rejects an empty name without calling the database', async () => {
    expect(await createGroup({ name: '  ' })).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls create_student_group and revalidates the students page only', async () => {
    mockRpc.mockResolvedValue({ data: GROUP, error: null })
    const r = await createGroup({ name: 'Cohort A', description: 'Spring' })
    expect(mockRpc).toHaveBeenCalledWith('create_student_group', {
      p_name: 'Cohort A',
      p_description: 'Spring',
    })
    expect(r).toEqual({ success: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    expect(mockRevalidatePath).not.toHaveBeenCalledWith('/app/admin/students/groups')
  })

  it('maps group_name_taken to a friendly error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'group_name_taken' } })
    expect(await createGroup({ name: 'Cohort A' })).toEqual({
      success: false,
      error: 'A group with this name already exists',
    })
  })

  it('maps not_admin to Not authorized', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_admin' } })
    expect(await createGroup({ name: 'x' })).toEqual({ success: false, error: 'Not authorized' })
  })
})

describe('updateGroup', () => {
  it('rejects a non-uuid group id', async () => {
    expect(await updateGroup({ groupId: 'x', name: 'n' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
  })

  it('passes an emptied description as an empty string so it clears', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    await updateGroup({ groupId: GROUP, name: 'n', description: '' })
    expect(mockRpc).toHaveBeenCalledWith('update_student_group', {
      p_group_id: GROUP,
      p_name: 'n',
      p_description: '',
    })
  })

  it('does not send an empty description when it is omitted (keeps the value)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    await updateGroup({ groupId: GROUP, name: 'n' })
    const args = mockRpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args.p_description === undefined || args.p_description === null).toBe(true)
    expect(args.p_description).not.toBe('')
  })

  it('maps group_not_found and group_name_taken', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'group_not_found' } })
    expect(await updateGroup({ groupId: GROUP, name: 'n' })).toEqual({
      success: false,
      error: 'Group not found',
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'group_name_taken' } })
    expect(await updateGroup({ groupId: GROUP, name: 'n' })).toEqual({
      success: false,
      error: 'A group with this name already exists',
    })
  })

  it('revalidates the students page only on success', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    expect(await updateGroup({ groupId: GROUP, name: 'n' })).toEqual({ success: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    expect(mockRevalidatePath).not.toHaveBeenCalledWith('/app/admin/students/groups')
  })
})

describe('deleteGroup', () => {
  it('rejects a non-uuid group id', async () => {
    expect(await deleteGroup({ groupId: 'x' })).toEqual({ success: false, error: 'Invalid input' })
  })

  it('calls delete_student_group and revalidates the students page only', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    expect(await deleteGroup({ groupId: GROUP })).toEqual({ success: true })
    expect(mockRpc).toHaveBeenCalledWith('delete_student_group', { p_group_id: GROUP })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    expect(mockRevalidatePath).not.toHaveBeenCalledWith('/app/admin/students/groups')
  })

  it('maps group_not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'group_not_found' } })
    expect(await deleteGroup({ groupId: GROUP })).toEqual({
      success: false,
      error: 'Group not found',
    })
  })
})
