import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { addCandidates } from './add-candidates'

const SID = '00000000-0000-4000-a000-0000000000a1'
const U1 = '00000000-0000-4000-a000-0000000000b1'
const G1 = '00000000-0000-4000-a000-0000000000c1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('addCandidates', () => {
  it.each([
    { sittingId: 'x', userIds: [U1] },
    { sittingId: SID },
    { sittingId: SID, userIds: ['nope'] },
  ])('rejects invalid input %j without calling the RPC', async (input) => {
    expect(await addCandidates(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns Not authorized and writes nothing for a non-admin caller', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Not authorized'))
    await expect(addCandidates({ sittingId: SID, userIds: [U1] })).rejects.toThrow()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls add_exam_sitting_candidates with userIds and maps the counts', async () => {
    mockRpc.mockResolvedValue({
      data: [{ added: 2, skipped_existing: 1, skipped_deactivated: 3 }],
      error: null,
    })
    const r = await addCandidates({ sittingId: SID, userIds: [U1] })
    expect(mockRpc).toHaveBeenCalledWith(
      'add_exam_sitting_candidates',
      expect.objectContaining({ p_sitting_id: SID, p_user_ids: [U1] }),
    )
    expect(r).toEqual({ success: true, added: 2, skippedExisting: 1, skippedDeactivated: 3 })
  })

  it('sends groupIds as p_group_ids', async () => {
    mockRpc.mockResolvedValue({
      data: [{ added: 1, skipped_existing: 0, skipped_deactivated: 0 }],
      error: null,
    })
    await addCandidates({ sittingId: SID, groupIds: [G1] })
    expect(mockRpc).toHaveBeenCalledWith(
      'add_exam_sitting_candidates',
      expect.objectContaining({ p_group_ids: [G1] }),
    )
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({
      data: [{ added: 1, skipped_existing: 0, skipped_deactivated: 0 }],
      error: null,
    })
    await addCandidates({ sittingId: SID, userIds: [U1] })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it('maps a closed sitting to its copy without revalidating', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sitting_closed' } })
    expect(await addCandidates({ sittingId: SID, userIds: [U1] })).toEqual({
      success: false,
      error: 'This sitting is closed and cannot be changed.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
