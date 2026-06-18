import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockGetCode = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('../email-queries', () => ({ getInternalExamCodeForEmail: mockGetCode }))
vi.mock('@/lib/email/resend', () => ({ sendEmail: mockSendEmail }))
vi.mock('@/lib/supabase-rpc', () => ({ rpc: mockRpc }))

// ---- Subject under test ---------------------------------------------------

import { sendInternalExamCodeEmail } from './send-code-email'

// ---- Helpers ---------------------------------------------------------------

const CODE_ID = '00000000-0000-4000-a000-000000000099'
const SUPABASE = { __marker: 'supabase' }
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
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
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
    expect(mockRpc).toHaveBeenCalledWith(SUPABASE, 'record_internal_exam_code_emailed', {
      p_code_id: CODE_ID,
    })
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
})
