import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockGetCode = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../email-queries', () => ({ getInternalExamCodeForEmail: mockGetCode }))
vi.mock('@/lib/email/resend', () => ({ sendEmail: mockSendEmail }))

// ---- Subject under test ---------------------------------------------------

import { sendInternalExamCodeEmail } from './send-code-email'

// ---- Helpers ---------------------------------------------------------------

const CODE_ID = '00000000-0000-4000-a000-000000000099'
const SUPABASE = { __marker: 'supabase', rpc: mockRpc }
const VALID_INPUT = { codeId: CODE_ID }
const FUTURE = '2999-01-01T00:00:00.000Z'

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({
    supabase: SUPABASE,
    organizationId: 'org-001',
    userId: 'admin-001',
  })
}

function activePayload(overrides: Record<string, unknown> = {}) {
  return {
    code: 'ABCD2345',
    studentEmail: 'alice@example.com',
    studentName: 'Alice',
    subjectName: 'Meteorology',
    expiresAt: FUTURE,
    consumedAt: null,
    voidedAt: null,
    sittingEntryId: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  // A valid base URL by default; the missing-URL test re-stubs this to ''.
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sendInternalExamCodeEmail', () => {
  it('sends the email and records the audit event on success', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload())
    mockSendEmail.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: true })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockRpc.mock.contexts[0]).toBe(SUPABASE)
    expect(mockRpc).toHaveBeenCalledWith('record_internal_exam_code_emailed', {
      p_code_id: CODE_ID,
    })
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/internal-exams')
  })

  it('rejects invalid input without calling the queries', async () => {
    const result = await sendInternalExamCodeEmail({ codeId: 'not-a-uuid' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockGetCode).not.toHaveBeenCalled()
  })

  it('returns "Code not found" when no payload is returned', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(null)

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Code not found' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns "Code is no longer active" when the code was consumed', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload({ consumedAt: '2026-01-01T00:00:00.000Z' }))

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Code is no longer active' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns "Code is no longer active" when the code was voided', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload({ voidedAt: '2026-01-01T00:00:00.000Z' }))

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Code is no longer active' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns "Code is no longer active" when the code is expired', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload({ expiresAt: '2000-01-01T00:00:00.000Z' }))

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Code is no longer active' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('returns "Failed to send email" and logs when sending fails', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload())
    mockSendEmail.mockResolvedValue({ ok: false, error: 'rate limited' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to send email' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[sendInternalExamCodeEmail] send failed:',
      'rate limited',
    )
  })

  it('still succeeds and logs when the audit RPC returns an error (best-effort)', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload())
    mockSendEmail.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'audit boom' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: true })
    expect(errorSpy).toHaveBeenCalledWith(
      '[sendInternalExamCodeEmail] Audit event failed:',
      'audit boom',
    )
    // On audit/stamp failure we skip revalidate so a stale (emailed_at=NULL)
    // refresh can't overwrite the client's optimistic "Sent" indicator.
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('derives the recipient server-side from the payload email', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload({ studentEmail: 'derived@example.com' }))
    mockSendEmail.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: null })

    await sendInternalExamCodeEmail(VALID_INPUT)

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'derived@example.com' }),
    )
  })

  it('fails without sending when NEXT_PUBLIC_APP_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Failed to send email' })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[sendInternalExamCodeEmail] NEXT_PUBLIC_APP_URL is not set',
    )
    errorSpy.mockRestore()
  })
})

describe('sendInternalExamCodeEmail sitting codes', () => {
  const sittingPayload = (overrides: Record<string, unknown> = {}) =>
    activePayload({
      sittingEntryId: 'entry-1',
      scheduledAt: '2999-11-24T09:00:00.000Z',
      mode: 'in_person',
      sittingStatus: 'scheduled',
      ...overrides,
    })

  it('sends a sitting code with the sitting template and records the audit event', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(sittingPayload())
    mockSendEmail.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: true })
    const arg = mockSendEmail.mock.calls[0]?.[0] as { to: string; subject: string; text: string }
    expect(arg.to).toBe('alice@example.com')
    expect(arg.subject).toMatch(/^Your access code: Meteorology internal exam, /)
    expect(arg.text).toContain('In person')
    expect(arg.text).toContain('ABCD2345')
    expect(mockRpc).toHaveBeenCalledWith('record_internal_exam_code_emailed', {
      p_code_id: CODE_ID,
    })
  })

  it('keeps the legacy template for a legacy code', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(activePayload())
    mockSendEmail.mockResolvedValue({ ok: true })
    mockRpc.mockResolvedValue({ data: null, error: null })

    await sendInternalExamCodeEmail(VALID_INPUT)

    const arg = mockSendEmail.mock.calls[0]?.[0] as { subject: string }
    expect(arg.subject).toBe('Your exam access code for Meteorology')
  })

  it.each([
    ['closed', 'This sitting is closed and cannot be changed.'],
    ['cancelled', 'This sitting is closed and cannot be changed.'],
  ])(
    'refuses a sitting code of a %s sitting with the sitting_closed copy',
    async (status, copy) => {
      mockAdmin()
      mockGetCode.mockResolvedValue(sittingPayload({ sittingStatus: status }))

      const result = await sendInternalExamCodeEmail(VALID_INPUT)

      expect(result).toEqual({ success: false, error: copy })
      expect(mockSendEmail).not.toHaveBeenCalled()
      expect(mockRpc).not.toHaveBeenCalled()
    },
  )

  it('refuses a sitting code once the sitting day has ended', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(sittingPayload({ scheduledAt: '2000-01-01T09:00:00.000Z' }))

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: "This sitting's day has ended." })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('reports a voided sitting code as no longer active', async () => {
    mockAdmin()
    mockGetCode.mockResolvedValue(sittingPayload({ voidedAt: '2026-01-01T00:00:00.000Z' }))

    const result = await sendInternalExamCodeEmail(VALID_INPUT)

    expect(result).toEqual({ success: false, error: 'Code is no longer active' })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
