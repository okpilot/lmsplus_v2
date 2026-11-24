import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { updateSitting } from './update-sitting'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'
const OK = { data: [{ changed: true, codes_restamped: 0, notify_code_ids: [] }], error: null }

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('updateSitting', () => {
  it('rejects a non-uuid sittingId without calling the RPC', async () => {
    const r = await updateSitting({ sittingId: 'nope', mode: 'remote' })
    expect(r).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sends only the invigilator for a locked sitting (other params unchanged)', async () => {
    mockRpc.mockResolvedValue(OK)
    await updateSitting({ sittingId: SID, invigilatorId: INV })
    const [name, params] = mockRpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('update_exam_sitting')
    expect(params.p_sitting_id).toBe(SID)
    expect(params.p_invigilator_id).toBe(INV)
    expect(params.p_scheduled_at ?? null).toBeNull()
    expect(params.p_mode ?? null).toBeNull()
    expect(params.p_permitted_materials ?? null).toBeNull()
  })

  it('succeeds and revalidates the list and the sitting page', async () => {
    mockRpc.mockResolvedValue(OK)
    const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
    expect(r.success).toBe(true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it.each([
    [
      'Time, mode and materials cannot be changed once the sitting is open.',
      'sitting_not_editable',
    ],
    ['This sitting is closed and cannot be changed.', 'sitting_closed'],
    ["This sitting's day has ended.", 'sitting_day_ended'],
  ])('shows "%s" when the sitting cannot be updated', async (copy, token) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await updateSitting({ sittingId: SID, mode: 'remote' })).toEqual({
      success: false,
      error: copy,
    })
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await updateSitting({ sittingId: SID, mode: 'remote' })).toEqual({
      success: false,
      error: 'Failed to update sitting',
    })
  })
})
