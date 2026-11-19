import { redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockDeliverNotices = vi.hoisted(() => vi.fn())
const mockGetSitting = vi.hoisted(() => vi.fn())
const mockChangedCodes = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../_utils/deliver-notices', () => ({ deliverNotices: mockDeliverNotices }))
vi.mock('../../notice-queries', () => ({
  getSittingForNotice: mockGetSitting,
  getChangedNoticeCodes: mockChangedCodes,
}))

import { updateSitting } from './update-sitting'

const SID = '00000000-0000-4000-a000-0000000000a1'
const INV = '00000000-0000-4000-a000-0000000000b1'
const OLD = { old_scheduled_at: '2999-11-24T09:00:00.000Z', old_mode: 'remote' }
const OK = {
  data: [{ changed: true, codes_restamped: 0, notify_code_ids: [], ...OLD }],
  error: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
  mockGetSitting.mockResolvedValue({ scheduledAt: '2999-11-24T09:00:00.000Z', mode: 'remote' })
  mockChangedCodes.mockResolvedValue([])
  mockDeliverNotices.mockResolvedValue({ sent: 0, failed: [], skipped: 0, unrecorded: 0 })
})

describe('updateSitting', () => {
  it('rethrows a redirect raised by the change-notice reads', async () => {
    mockRpc.mockResolvedValue({
      data: [{ changed: true, codes_restamped: 0, notify_code_ids: ['c1'], ...OLD }],
      error: null,
    })
    mockChangedCodes.mockImplementation(() => redirect('/x'))
    await expect(updateSitting({ sittingId: SID, mode: 'remote' })).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
  })

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
    expect('p_permitted_materials' in params).toBe(false)
  })

  it('succeeds and revalidates the list and the sitting page', async () => {
    mockRpc.mockResolvedValue(OK)
    const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
    expect(r.success).toBe(true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it.each([
    ['Time and mode cannot be changed once the sitting is open.', 'sitting_not_editable'],
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

  it('sends no change notice when notify_code_ids is empty (materials or invigilator only)', async () => {
    mockRpc.mockResolvedValue(OK)
    const r = await updateSitting({ sittingId: SID, invigilatorId: INV })
    expect(mockChangedCodes).not.toHaveBeenCalled()
    expect(mockDeliverNotices).not.toHaveBeenCalled()
    expect(r.success).toBe(true)
  })

  it('does not read the old time and mode before the RPC', async () => {
    mockRpc.mockResolvedValue(OK)
    await updateSitting({ sittingId: SID, mode: 'in_person' })
    const before = mockGetSitting.mock.invocationCallOrder.filter(
      (o) => o < (mockRpc.mock.invocationCallOrder[0] ?? 0),
    )
    expect(before).toEqual([])
  })

  it('takes the notice old time and mode from the RPC row', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          changed: true,
          codes_restamped: 1,
          notify_code_ids: ['c1'],
          old_scheduled_at: '2999-01-01T08:00:00.000Z',
          old_mode: 'in_person',
        },
      ],
      error: null,
    })
    mockChangedCodes.mockResolvedValue([{ codeId: 'c1', userId: 'u1', subjectId: 's1' }])
    mockGetSitting.mockResolvedValue({ scheduledAt: '2999-11-24T09:00:00.000Z', mode: 'remote' })
    await updateSitting({ sittingId: SID, mode: 'remote' })
    expect(mockDeliverNotices).toHaveBeenCalledTimes(1)
    const arg = mockDeliverNotices.mock.calls[0]?.[0] as { change: Record<string, unknown> }
    expect(JSON.stringify(arg)).toContain('2999-01-01T08:00:00.000Z')
    expect(JSON.stringify(arg)).toContain('in_person')
  })

  it('sends a changed notice to the emailed students when time or mode changed', async () => {
    mockRpc.mockResolvedValue({
      data: [{ changed: true, codes_restamped: 2, notify_code_ids: ['c1', 'c2'], ...OLD }],
      error: null,
    })
    const items = [{ codeId: 'c1', userId: 'u1', subjectId: 's1' }]
    mockChangedCodes.mockResolvedValue(items)
    mockDeliverNotices.mockResolvedValue({ sent: 1, failed: [], skipped: 0, unrecorded: 0 })
    const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
    expect(mockChangedCodes).toHaveBeenCalledWith('o', SID, ['c1', 'c2'])
    expect(mockDeliverNotices).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'changed', orgId: 'o', sittingId: SID, items }),
    )
    expect(r).toMatchObject({ success: true, notices: { sent: 1, failed: [] } })
  })

  it('sends nothing when the RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_closed' } })
    await updateSitting({ sittingId: SID, mode: 'remote' })
    expect(mockDeliverNotices).not.toHaveBeenCalled()
  })

  describe('change notice errors', () => {
    const CHANGED = {
      data: [{ changed: true, codes_restamped: 1, notify_code_ids: ['c1'], ...OLD }],
      error: null,
    }
    const ERR = { sent: 0, failed: [], error: true }

    it('flags error when the RPC row has no old values (old DB)', async () => {
      mockRpc.mockResolvedValue({
        data: [{ changed: true, codes_restamped: 1, notify_code_ids: ['c1'] }],
        error: null,
      })
      const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
      expect(r).toMatchObject({ success: true, notices: ERR })
      expect(mockDeliverNotices).not.toHaveBeenCalled()
    })

    it('flags error when a notice query throws', async () => {
      mockRpc.mockResolvedValue(CHANGED)
      mockChangedCodes.mockRejectedValue(new Error('db down'))
      const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
      expect(r).toMatchObject({ success: true, notices: ERR })
    })

    it('flags error when delivery reports error', async () => {
      mockRpc.mockResolvedValue(CHANGED)
      mockChangedCodes.mockResolvedValue([{ codeId: 'c1', userId: 'u1', subjectId: 's1' }])
      mockDeliverNotices.mockResolvedValue({
        sent: 0,
        failed: [],
        skipped: 0,
        unrecorded: 0,
        error: true,
      })
      const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
      expect(r).toMatchObject({ success: true, notices: ERR })
    })

    it('has no error key when nothing went wrong', async () => {
      mockRpc.mockResolvedValue(OK)
      const r = await updateSitting({ sittingId: SID, mode: 'in_person' })
      expect(r).toMatchObject({ notices: { sent: 0, failed: [] } })
      expect((r as { notices: object }).notices).not.toHaveProperty('error')
    })
  })
})
