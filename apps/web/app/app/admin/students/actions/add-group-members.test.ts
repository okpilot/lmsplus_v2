import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRevalidatePath, mockRpc, mockRequireAdmin } = vi.hoisted(() => ({
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { addGroupMembers } from './add-group-members'

const GROUP = 'a0000000-0000-4000-8000-000000000001'
const U1 = 'b0000000-0000-4000-8000-000000000001'
const INPUT = { groupId: GROUP, userIds: [U1] }

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ supabase: { rpc: mockRpc }, organizationId: 'org' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('addGroupMembers', () => {
  it('rejects invalid input before touching auth or the database', async () => {
    const r = await addGroupMembers({ groupId: 'x', userIds: [] })
    expect(r).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls add_student_group_members with the group and user ids and returns the count', async () => {
    mockRpc.mockResolvedValue({ data: 1, error: null })
    const r = await addGroupMembers(INPUT)
    expect(mockRpc).toHaveBeenCalledWith('add_student_group_members', {
      p_group_id: GROUP,
      p_user_ids: [U1],
    })
    expect(r).toEqual({ success: true, count: 1 })
  })

  it('revalidates the students page only on success', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null })
    await addGroupMembers(INPUT)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    expect(mockRevalidatePath).not.toHaveBeenCalledWith('/app/admin/students/groups')
  })

  it.each([
    ['not_authenticated', 'Not authorized'],
    ['not_admin', 'Not authorized'],
    ['invalid_input', 'Invalid input'],
    ['group_not_found', 'Group not found'],
    ['student_not_found', 'Some selected students are inactive or not found'],
  ])('maps the %s RPC error to "%s"', async (message, error) => {
    mockRpc.mockResolvedValue({ data: null, error: { message } })
    expect(await addGroupMembers(INPUT)).toEqual({ success: false, error })
  })

  it('never leaks an unmapped RPC message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation x secret' } })
    const r = await addGroupMembers(INPUT)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).not.toContain('secret')
  })
})
