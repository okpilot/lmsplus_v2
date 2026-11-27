import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockGetCodes = vi.hoisted(() => vi.fn())
const mockSendBatch = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../../email-queries', () => ({ getSittingCodesForEmail: mockGetCodes }))
vi.mock('@/lib/email/resend', () => ({ sendEmailBatch: mockSendBatch }))

import { emailSittingCodes } from './email-sitting-codes'

const SID = '00000000-0000-4000-a000-0000000000a1'
const SUPABASE = { rpc: mockRpc }
const FUTURE = '2999-11-24T09:00:00.000Z'

const row = (n: number) => ({
  codeId: `code-${n}`,
  code: `CODE000${n}`,
  studentName: `Student ${n}`,
  email: `s${n}@example.com`,
  subjectName: `Subject ${n}`,
  scheduledAt: FUTURE,
  mode: 'remote',
})

function found(rows: unknown[], over: Record<string, unknown> = {}) {
  mockGetCodes.mockResolvedValue({
    sitting: { status: 'scheduled', scheduledAt: FUTURE },
    rows,
    skipped: 0,
    ...over,
  })
}

const allSent = (n: number) => ({ sent: Array.from({ length: n }, (_, i) => i), failed: [] })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: 'org-1',
    userId: 'admin-1',
  })
  mockRpc.mockResolvedValue({ data: null, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('emailSittingCodes', () => {
  it.each([{ sittingId: 'x' }, {}])(
    'rejects invalid input %j without reading or sending',
    async (input) => {
      expect(await emailSittingCodes(input)).toEqual({ success: false, error: 'Invalid input' })
      expect(mockGetCodes).not.toHaveBeenCalled()
      expect(mockSendBatch).not.toHaveBeenCalled()
    },
  )

  it('propagates the requireAdmin rejection and does nothing for a non-admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(emailSittingCodes({ sittingId: SID })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockGetCodes).not.toHaveBeenCalled()
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it("reads the codes with the admin's organization and the sitting id", async () => {
    found([])
    await emailSittingCodes({ sittingId: SID })
    expect(mockGetCodes).toHaveBeenCalledWith('org-1', SID)
  })

  it('reports Sitting not found when the sitting is not in the organization', async () => {
    mockGetCodes.mockResolvedValue({ sitting: null, rows: [], skipped: 0 })
    expect(await emailSittingCodes({ sittingId: SID })).toEqual({
      success: false,
      error: 'Sitting not found',
    })
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it.each(['closed', 'cancelled'])('refuses a %s sitting and sends nothing', async (status) => {
    found([row(1)], { sitting: { status, scheduledAt: FUTURE } })
    expect(await emailSittingCodes({ sittingId: SID })).toEqual({
      success: false,
      error: 'This sitting is closed and cannot be changed.',
    })
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it('refuses a sitting whose day has ended and sends nothing', async () => {
    found([row(1)], { sitting: { status: 'open', scheduledAt: '2000-01-01T09:00:00.000Z' } })
    expect(await emailSittingCodes({ sittingId: SID })).toEqual({
      success: false,
      error: "This sitting's day has ended.",
    })
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it('fails without sending when NEXT_PUBLIC_APP_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    found([row(1)])
    const r = await emailSittingCodes({ sittingId: SID })
    expect(r.success).toBe(false)
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it('sends one sitting-template message per row, to the row email, in order', async () => {
    found([row(1), row(2)])
    mockSendBatch.mockResolvedValue(allSent(2))
    await emailSittingCodes({ sittingId: SID })
    const msgs = mockSendBatch.mock.calls[0]?.[0] as {
      to: string
      subject: string
      html: string
      text: string
    }[]
    expect(msgs.map((m) => m.to)).toEqual(['s1@example.com', 's2@example.com'])
    expect(msgs[0]?.subject).toMatch(/^Your access code: Subject 1 internal exam, /)
    expect(msgs[1]?.text).toContain('CODE0002')
    expect(msgs[0]?.html).toContain('https://app.example.com/app/internal-exam')
  })

  it('records each sent code with the user client, revalidates and returns the counts', async () => {
    found([row(1), row(2)], { skipped: 3 })
    mockSendBatch.mockResolvedValue(allSent(2))
    const r = await emailSittingCodes({ sittingId: SID })
    expect(r).toMatchObject({ success: true, sent: 2, failed: [], skipped: 3 })
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc).toHaveBeenCalledWith('record_internal_exam_code_emailed', {
      p_code_id: 'code-1',
    })
    expect(mockRpc).toHaveBeenCalledWith('record_internal_exam_code_emailed', {
      p_code_id: 'code-2',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/app/admin/internal-exams/sittings/${SID}`)
  })

  it('records only the codes that were sent and lists the failed people', async () => {
    found([row(1), row(2), row(3)])
    mockSendBatch.mockResolvedValue({ sent: [0, 2], failed: [{ index: 1, error: 'bad' }] })
    const r = await emailSittingCodes({ sittingId: SID })
    expect(r).toMatchObject({
      success: true,
      sent: 2,
      failed: [{ studentName: 'Student 2', subjectName: 'Subject 2' }],
    })
    const recorded = mockRpc.mock.calls.map((c) => (c[1] as { p_code_id: string }).p_code_id)
    expect(recorded.sort()).toEqual(['code-1', 'code-3'])
  })

  it('counts a failed record call as unrecorded and does not throw', async () => {
    found([row(1), row(2)])
    mockSendBatch.mockResolvedValue(allSent(2))
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      .mockResolvedValueOnce({ data: null, error: null })
    const r = await emailSittingCodes({ sittingId: SID })
    expect(r).toMatchObject({ success: true, sent: 2, failed: [], unrecorded: 1 })
  })

  it('counts a throwing record call as unrecorded and does not throw', async () => {
    found([row(1)])
    mockSendBatch.mockResolvedValue(allSent(1))
    mockRpc.mockRejectedValue(new Error('network'))
    const r = await emailSittingCodes({ sittingId: SID })
    expect(r).toMatchObject({ success: true, sent: 1, unrecorded: 1 })
  })

  it('logs the code id of a returned record error', async () => {
    found([row(1), row(2)])
    mockSendBatch.mockResolvedValue(allSent(2))
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
      .mockResolvedValueOnce({ data: null, error: null })
    await emailSittingCodes({ sittingId: SID })
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      '[emailSittingCodes] record failed',
      'code-1',
      'boom',
    )
  })

  it('logs the code id of a rejected record call', async () => {
    found([row(1)])
    mockSendBatch.mockResolvedValue(allSent(1))
    mockRpc.mockRejectedValue(new Error('network'))
    await emailSittingCodes({ sittingId: SID })
    expect(console.error).toHaveBeenCalledWith(
      '[emailSittingCodes] record failed',
      'code-1',
      'network',
    )
  })

  it('returns a generic failure and sends nothing when the lookup throws', async () => {
    mockGetCodes.mockRejectedValue(new Error('db down'))
    expect(await emailSittingCodes({ sittingId: SID })).toEqual({
      success: false,
      error: 'Failed to send email',
    })
    expect(console.error).toHaveBeenCalledWith(
      '[emailSittingCodes] lookup failed',
      expect.any(Error),
    )
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it('sends nothing when every code was already emailed (re-run)', async () => {
    found([])
    const r = await emailSittingCodes({ sittingId: SID })
    expect(r).toMatchObject({ success: true, sent: 0, failed: [] })
    expect(mockSendBatch).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
