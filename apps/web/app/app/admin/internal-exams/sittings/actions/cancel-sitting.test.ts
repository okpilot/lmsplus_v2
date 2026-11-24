import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { cancelSitting } from './cancel-sitting'

const SID = '00000000-0000-4000-a000-0000000000a1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('cancelSitting', () => {
  it('rejects a non-uuid sittingId without calling the RPC', async () => {
    expect(await cancelSitting({ sittingId: 'x' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ codes_voided: 1, notify_code_ids: [] }], error: null })
    const r = await cancelSitting({ sittingId: SID })
    expect(mockRpc).toHaveBeenCalledWith('cancel_exam_sitting', { p_sitting_id: SID })
    expect(r.success).toBe(true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it('tells the admin a candidate has already taken an exam when cancelling', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_has_attempts' } })
    expect(await cancelSitting({ sittingId: SID })).toEqual({
      success: false,
      error: 'A candidate has already taken an exam in this sitting.',
    })
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await cancelSitting({ sittingId: SID })).toEqual({
      success: false,
      error: 'Failed to cancel sitting',
    })
  })
})
