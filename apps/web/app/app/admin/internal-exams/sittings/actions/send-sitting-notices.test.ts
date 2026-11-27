import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockDeliver = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../_utils/deliver-notices', () => ({ deliverPendingNotices: mockDeliver }))

import { sendSittingNotices } from './send-sitting-notices'

const SID = '00000000-0000-4000-a000-0000000000a1'
const SUPABASE = { rpc: vi.fn() }

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ supabase: SUPABASE, organizationId: 'org-1', userId: 'a' })
  mockDeliver.mockResolvedValue({ sent: 2, failed: [], skipped: 0, unrecorded: 0 })
})

describe('sendSittingNotices', () => {
  it.each([{ sittingId: 'x' }, {}])(
    'rejects invalid input %j without delivering',
    async (input) => {
      expect(await sendSittingNotices(input)).toEqual({ success: false, error: 'Invalid input' })
      expect(mockDeliver).not.toHaveBeenCalled()
    },
  )

  it('propagates the requireAdmin rejection and delivers nothing for a non-admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(sendSittingNotices({ sittingId: SID })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockDeliver).not.toHaveBeenCalled()
  })

  it("delivers with the admin's client and organization, then revalidates the sitting", async () => {
    await sendSittingNotices({ sittingId: SID })
    expect(mockDeliver).toHaveBeenCalledWith({
      supabase: SUPABASE,
      orgId: 'org-1',
      sittingId: SID,
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it('returns the counts', async () => {
    mockDeliver.mockResolvedValue({
      sent: 3,
      failed: [{ studentName: 'Ann' }],
      skipped: 1,
      unrecorded: 0,
    })
    expect(await sendSittingNotices({ sittingId: SID })).toMatchObject({
      success: true,
      sent: 3,
      failed: [{ studentName: 'Ann' }],
      skipped: 1,
    })
  })

  it('returns success with sent 0 for an empty delivery result', async () => {
    mockDeliver.mockResolvedValue({ sent: 0, failed: [], skipped: 0, unrecorded: 0 })
    expect(await sendSittingNotices({ sittingId: SID })).toMatchObject({ success: true, sent: 0 })
  })

  it('fails when nothing was sent and an error occurred', async () => {
    mockDeliver.mockResolvedValue({ sent: 0, failed: [], skipped: 0, unrecorded: 0, error: true })
    expect(await sendSittingNotices({ sittingId: SID })).toEqual({
      success: false,
      error: 'Failed to send notices',
    })
  })

  it('succeeds with the failed names when nothing was sent, an error occurred and some failed', async () => {
    mockDeliver.mockResolvedValue({
      sent: 0,
      failed: [{ studentName: 'X' }],
      skipped: 0,
      unrecorded: 0,
      error: true,
    })
    expect(await sendSittingNotices({ sittingId: SID })).toMatchObject({
      success: true,
      sent: 0,
      failed: [{ studentName: 'X' }],
    })
  })

  it('succeeds with the counts when some were sent despite an error', async () => {
    mockDeliver.mockResolvedValue({ sent: 1, failed: [], skipped: 0, unrecorded: 0, error: true })
    expect(await sendSittingNotices({ sittingId: SID })).toMatchObject({
      success: true,
      sent: 1,
      error: true,
    })
  })
})
