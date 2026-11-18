import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { closeSitting } from './close-sitting'

const SID = '00000000-0000-4000-a000-0000000000a1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('closeSitting', () => {
  it('rejects a non-uuid sittingId without calling the RPC', async () => {
    expect(await closeSitting({ sittingId: 'x' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns voided and absent counts and revalidates', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          closed_at: '2026-11-18T18:00:00Z',
          codes_voided: 4,
          attempts_running: 1,
          absent_count: 2,
        },
      ],
      error: null,
    })
    const r = await closeSitting({ sittingId: SID })
    expect(mockRpc).toHaveBeenCalledWith('close_exam_sitting', { p_sitting_id: SID })
    expect(r).toMatchObject({ success: true, codesVoided: 4, absentCount: 2, attemptsRunning: 1 })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
  })

  it.each([
    ['sitting_not_open', 'This sitting is not open.'],
    ['sitting_closed', 'This sitting is closed and cannot be changed.'],
  ])('maps %s to its copy', async (token, copy) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await closeSitting({ sittingId: SID })).toEqual({ success: false, error: copy })
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await closeSitting({ sittingId: SID })).toEqual({
      success: false,
      error: 'Failed to close sitting',
    })
  })
})
