import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockVoid = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('../../actions/void-code', () => ({ voidInternalExamCode: mockVoid }))

import { voidSittingCode } from './void-sitting-code'

const SID = '00000000-0000-4000-a000-0000000000a1'
const CID = '00000000-0000-4000-a000-0000000000d1'

beforeEach(() => vi.resetAllMocks())

describe('voidSittingCode', () => {
  it.each([
    { sittingId: 'x', codeId: CID, reason: 'r' },
    { sittingId: SID, codeId: 'x', reason: 'r' },
    { sittingId: SID, codeId: CID, reason: '   ' },
    { sittingId: SID, codeId: CID, reason: 'a'.repeat(501) },
  ])('rejects invalid input %j without voiding', async (input) => {
    expect(await voidSittingCode(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockVoid).not.toHaveBeenCalled()
  })

  it('passes the code id and reason to the legacy void action', async () => {
    mockVoid.mockResolvedValue({ success: true, codeId: CID, sessionId: null, sessionEnded: false })
    await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'Wrong person' })
    expect(mockVoid).toHaveBeenCalledWith({ codeId: CID, reason: 'Wrong person' })
  })

  it('revalidates the list and the sitting page on success', async () => {
    mockVoid.mockResolvedValue({ success: true, codeId: CID, sessionId: null, sessionEnded: false })
    const r = await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'Wrong person' })
    expect(r.success).toBe(true)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it('returns the legacy error and does not revalidate on failure', async () => {
    mockVoid.mockResolvedValue({ success: false, error: 'Code is already voided' })
    expect(await voidSittingCode({ sittingId: SID, codeId: CID, reason: 'x' })).toEqual({
      success: false,
      error: 'Code is already voided',
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
