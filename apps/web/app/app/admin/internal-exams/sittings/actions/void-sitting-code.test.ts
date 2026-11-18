import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { voidSittingCode } from './void-sitting-code'

const SID = '00000000-0000-4000-a000-0000000000a1'
const CID = '00000000-0000-4000-a000-0000000000d1'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    organizationId: 'o',
    userId: 'a',
  })
})

describe('voidSittingCode', () => {
  it.each([
    { sittingId: 'x', codeId: CID, reason: 'r' },
    { sittingId: SID, codeId: 'x', reason: 'r' },
    { sittingId: SID, codeId: CID, reason: '   ' },
    { sittingId: SID, codeId: CID, reason: 'a'.repeat(501) },
  ])('rejects invalid input %j without calling the RPC', async (input) => {
    expect(await voidSittingCode(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls void_sitting_code with the sitting id, code id and reason', async () => {
    mockRpc.mockResolvedValue({ data: [{ code_id: CID }], error: null })
    await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'Wrong person' })
    expect(mockRpc).toHaveBeenCalledWith('void_sitting_code', {
      p_sitting_id: SID,
      p_code_id: CID,
      p_reason: 'Wrong person',
    })
  })

  it('returns the voided code id on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ code_id: CID }], error: null })
    expect(await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'x' })).toEqual({
      success: true,
      codeId: CID,
    })
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ code_id: CID }], error: null })
    await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'Wrong person' })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it('maps code_in_use to its copy and does not revalidate', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'code_in_use' } })
    expect(await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'x' })).toEqual({
      success: false,
      error: 'This code has been used. Refresh the page.',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it.each(['code_not_found', 'code_voided', 'sitting_closed', 'weird'])(
    'fails on %s without revalidating',
    async (token) => {
      mockRpc.mockResolvedValue({ data: null, error: { message: token } })
      const r = await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'x' })
      expect(r.success).toBe(false)
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    },
  )
})
