import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { createSitting } from './create-sitting'

const INV = '00000000-0000-4000-a000-0000000000b1'
const SID = '00000000-0000-4000-a000-0000000000a1'
const VALID = {
  scheduledAt: '2026-11-20T09:30:00.000Z',
  mode: 'remote',
  invigilatorId: INV,
  permittedMaterials: 'Calculator',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('createSitting', () => {
  it('rejects invalid input without calling the RPC', async () => {
    const r = await createSitting({ ...VALID, scheduledAt: 'tomorrow' })
    expect(r).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls create_exam_sitting with the parsed fields', async () => {
    mockRpc.mockResolvedValue({ data: SID, error: null })
    await createSitting(VALID)
    expect(mockRpc).toHaveBeenCalledWith(
      'create_exam_sitting',
      expect.objectContaining({
        p_scheduled_at: VALID.scheduledAt,
        p_mode: 'remote',
        p_invigilator_id: INV,
        p_permitted_materials: 'Calculator',
      }),
    )
  })

  it('returns the new sittingId and revalidates the list', async () => {
    mockRpc.mockResolvedValue({ data: SID, error: null })
    const r = await createSitting(VALID)
    expect(r).toEqual({ success: true, sittingId: SID })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
  })

  it.each([
    ['scheduled_in_past', 'The sitting date must be today or later (UTC).'],
    [
      'invigilator_not_found',
      'The invigilator must be an active admin or instructor of your organization',
    ],
    ['not_admin', 'Not authorized'],
  ])('maps %s to its copy and does not revalidate', async (token, copy) => {
    mockRpc.mockResolvedValue({ data: null, error: { message: token } })
    expect(await createSitting(VALID)).toEqual({ success: false, error: copy })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('falls back to a generic message for an unmapped error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'weird' } })
    expect(await createSitting(VALID)).toEqual({
      success: false,
      error: 'Failed to create sitting',
    })
  })
})
