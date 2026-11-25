import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { issueSittingCodes } from './issue-sitting-codes'

const SID = '00000000-0000-4000-a000-0000000000a1'
const E1 = '00000000-0000-4000-a000-0000000000c1'
const ROW = {
  issued: 1,
  reissued_after_expiry: 0,
  skipped_already_issued: 2,
  skipped_attempt_taken: 3,
  skipped_deactivated: 4,
  skipped_no_config: 5,
  skipped_not_enrolled: 6,
  skipped_passed: 7,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('issueSittingCodes', () => {
  it.each([
    { sittingId: 'x', entryIds: [E1] },
    { sittingId: SID, entryIds: ['nope'] },
    { sittingId: SID, entryIds: [] },
  ])('rejects invalid input %j without calling the RPC', async (input) => {
    expect(await issueSittingCodes(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('sends only the entry id for a single-entry issue', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null })
    await issueSittingCodes({ sittingId: SID, entryIds: [E1] })
    expect(mockRpc).toHaveBeenCalledTimes(1)
    const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('issue_sitting_exam_codes')
    expect(args.p_sitting_id).toBe(SID)
    expect(args.p_entry_ids).toEqual([E1])
    expect(args.p_user_ids ?? null).toBeNull()
  })

  it('maps every count of the result', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null })
    expect(await issueSittingCodes({ sittingId: SID, entryIds: [E1] })).toEqual({
      success: true,
      issued: 1,
      reissuedAfterExpiry: 0,
      skippedAlreadyIssued: 2,
      skippedAttemptTaken: 3,
      skippedDeactivated: 4,
      skippedNoConfig: 5,
      skippedNotEnrolled: 6,
      skippedPassed: 7,
    })
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({ data: [ROW], error: null })
    await issueSittingCodes({ sittingId: SID, entryIds: [E1] })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it.each([
    ['entry_not_found', 'This exam is no longer in the sitting. Reload the page.'],
    ['code_generation_failed', 'Could not generate a unique code. Try again.'],
    ['sitting_day_ended', "This sitting's day has ended."],
  ])('maps %s to its copy', async (token, copy) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await issueSittingCodes({ sittingId: SID, entryIds: [E1] })).toEqual({
      success: false,
      error: copy,
    })
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await issueSittingCodes({ sittingId: SID, entryIds: [E1] })).toEqual({
      success: false,
      error: 'Failed to issue codes',
    })
  })
})
