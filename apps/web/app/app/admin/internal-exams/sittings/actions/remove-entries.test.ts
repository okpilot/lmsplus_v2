import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { removeSittingEntries } from './remove-entries'

const SID = '00000000-0000-4000-a000-0000000000a1'
const E1 = '00000000-0000-4000-a000-0000000000c1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('removeSittingEntries', () => {
  it.each([
    { sittingId: 'x', entryIds: [E1] },
    { sittingId: SID, entryIds: [] },
    { sittingId: SID, entryIds: ['nope'] },
  ])('rejects invalid input %j without calling the RPC', async (input) => {
    expect(await removeSittingEntries(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls remove_exam_sitting_entries and maps the counts', async () => {
    mockRpc.mockResolvedValue({ data: [{ removed: 1, codes_voided: 1 }], error: null })
    const r = await removeSittingEntries({ sittingId: SID, entryIds: [E1] })
    expect(mockRpc).toHaveBeenCalledWith('remove_exam_sitting_entries', {
      p_sitting_id: SID,
      p_entry_ids: [E1],
    })
    expect(r).toEqual({ success: true, removed: 1, codesVoided: 1 })
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ removed: 1, codes_voided: 0 }], error: null })
    await removeSittingEntries({ sittingId: SID, entryIds: [E1] })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it.each([
    ['entry_has_attempt', 'This exam has been taken. It cannot be removed.'],
    ['entry_not_found', 'This exam is no longer in the sitting. Reload the page.'],
  ])('maps %s to its copy', async (token, copy) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await removeSittingEntries({ sittingId: SID, entryIds: [E1] })).toEqual({
      success: false,
      error: copy,
    })
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await removeSittingEntries({ sittingId: SID, entryIds: [E1] })).toEqual({
      success: false,
      error: 'Failed to remove exam',
    })
  })
})
