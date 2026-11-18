import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { removeCandidates } from './remove-candidates'

const SID = '00000000-0000-4000-a000-0000000000a1'
const U1 = '00000000-0000-4000-a000-0000000000b1'
const U2 = '00000000-0000-4000-a000-0000000000b2'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('removeCandidates', () => {
  it.each([
    { sittingId: 'x', userIds: [U1] },
    { sittingId: SID, userIds: [] },
    { sittingId: SID, userIds: ['nope'] },
    { sittingId: SID },
  ])('rejects invalid input %j without calling the RPC', async (input) => {
    expect(await removeCandidates(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls remove_exam_sitting_candidates and maps the counts', async () => {
    mockRpc.mockResolvedValue({
      data: [{ removed: 2, entries_removed: 5, codes_voided: 3 }],
      error: null,
    })
    const r = await removeCandidates({ sittingId: SID, userIds: [U1, U2] })
    expect(mockRpc).toHaveBeenCalledWith('remove_exam_sitting_candidates', {
      p_sitting_id: SID,
      p_user_ids: [U1, U2],
    })
    expect(r).toEqual({ success: true, removed: 2, entriesRemoved: 5, codesVoided: 3 })
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({
      data: [{ removed: 1, entries_removed: 0, codes_voided: 0 }],
      error: null,
    })
    await removeCandidates({ sittingId: SID, userIds: [U1] })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it.each([
    [
      'candidate_has_attempt',
      'Someone you selected has taken an exam. History is permanent: they cannot be removed.',
    ],
    ['candidate_not_found', 'Someone you selected is no longer in this sitting. Reload the page.'],
    ['sitting_closed', 'This sitting is closed and cannot be changed.'],
    ['not_admin', 'Not authorized'],
  ])('maps %s to its copy and does not revalidate', async (token, copy) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await removeCandidates({ sittingId: SID, userIds: [U1] })).toEqual({
      success: false,
      error: copy,
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await removeCandidates({ sittingId: SID, userIds: [U1] })).toEqual({
      success: false,
      error: 'Failed to remove people',
    })
  })
})
