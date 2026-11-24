import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { startSitting } from './start-sitting'

const SID = '00000000-0000-4000-a000-0000000000a1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('startSitting', () => {
  it('rejects a non-uuid sittingId without calling the RPC', async () => {
    expect(await startSitting({ sittingId: 'x' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'returns entriesWithoutCode and invigilatorActive=%s and revalidates',
    async (active) => {
      mockRpc.mockResolvedValue({
        data: [
          {
            started_at: '2026-11-18T09:00:00Z',
            codes_restamped: 2,
            invigilator_active: active,
            entries_without_code: 3,
          },
        ],
        error: null,
      })
      const r = await startSitting({ sittingId: SID })
      expect(mockRpc).toHaveBeenCalledWith('start_exam_sitting', { p_sitting_id: SID })
      expect(r).toMatchObject({ success: true, entriesWithoutCode: 3, invigilatorActive: active })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
    },
  )

  it.each([
    [
      'Too early: a sitting can start from its UTC day. Edit the date to run it earlier.',
      'sitting_not_due',
    ],
    ['This sitting has already been started.', 'sitting_not_scheduled'],
    ["This sitting's day has ended.", 'sitting_day_ended'],
  ])('shows "%s" when the sitting cannot be started', async (copy, token) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await startSitting({ sittingId: SID })).toEqual({ success: false, error: copy })
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await startSitting({ sittingId: SID })).toEqual({
      success: false,
      error: 'Failed to start sitting',
    })
  })
})
