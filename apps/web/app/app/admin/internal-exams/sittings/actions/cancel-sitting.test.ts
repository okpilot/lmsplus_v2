import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockDeliver = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../_utils/deliver-notices', () => ({ deliverPendingNotices: mockDeliver }))

import { cancelSitting } from './cancel-sitting'

const SID = '00000000-0000-4000-a000-0000000000a1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
  mockDeliver.mockResolvedValue({ sent: 0, failed: [], skipped: 0, unrecorded: 0 })
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

  it('delivers the pending notices after the RPC and returns sent and failed', async () => {
    mockRpc.mockResolvedValue({ data: [{ codes_voided: 2, notify_code_ids: [] }], error: null })
    mockDeliver.mockResolvedValue({
      sent: 1,
      failed: [{ studentName: 'Ann' }],
      skipped: 0,
      unrecorded: 0,
    })
    const r = await cancelSitting({ sittingId: SID })
    expect(mockDeliver).toHaveBeenCalledWith({
      supabase: expect.objectContaining({ rpc: mockRpc }),
      orgId: 'o',
      sittingId: SID,
    })
    expect(mockRpc.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeliver.mock.invocationCallOrder[0] ?? 0,
    )
    expect(r).toMatchObject({
      success: true,
      codesVoided: 2,
      notices: { sent: 1, failed: [{ studentName: 'Ann' }] },
    })
  })

  it('delivers nothing when the cancel RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_has_attempts' } })
    await cancelSitting({ sittingId: SID })
    expect(mockDeliver).not.toHaveBeenCalled()
  })
})
