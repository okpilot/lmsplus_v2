import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockGenerateTempPassword = vi.hoisted(() => vi.fn())
const mockIssueTempPassword = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())
const mockRecordAuthEvent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/generate-temp-password', () => ({
  generateTempPassword: mockGenerateTempPassword,
}))
vi.mock('./issue-temp-password', () => ({ issueTempPassword: mockIssueTempPassword }))
vi.mock('@/lib/email/resend', () => ({ sendEmail: mockSendEmail }))
vi.mock('@/lib/audit/record-auth-event', () => ({ recordAuthEvent: mockRecordAuthEvent }))
// temp-password-admin re-exports the admin client's module, which throws when
// imported outside a server context (jsdom test env looks like a browser) —
// only TEMP_PASSWORD_TTL_MS (a plain constant) is needed here.
vi.mock('@/lib/auth/temp-password-admin', () => ({ TEMP_PASSWORD_TTL_MS: 7 * 24 * 60 * 60 * 1000 }))

// ---- Subject under test -------------------------------------------------------

import { issueAndEmailPassword } from './deliver-login-instructions'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const ORG_ID = '00000000-0000-4000-a000-000000000002'
const PRIOR_EXPIRY = '2026-09-20T00:00:00.000Z'
const PASSWORD = 'Xy7hK2mPqW9r'

const RECIPIENT = {
  email: 'alice@example.com',
  fullName: 'Alice',
  tempPasswordExpiresAt: PRIOR_EXPIRY,
}

const SUPABASE = { __marker: 'supabase' } as never
const OPTS = { supabase: SUPABASE, id: USER_ID, organizationId: ORG_ID, recipient: RECIPIENT }
const PASSWORD_RESET_AUDIT = {
  eventType: 'user.password_reset',
  resourceId: USER_ID,
  context: 'sendLoginInstructions',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGenerateTempPassword.mockReturnValue(PASSWORD)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('issueAndEmailPassword', () => {
  it('issues the password using the recipient prior expiry, then emails it', async () => {
    mockIssueTempPassword.mockResolvedValue('issued')
    mockSendEmail.mockResolvedValue({ ok: true })

    const result = await issueAndEmailPassword(OPTS)

    expect(mockIssueTempPassword).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: ORG_ID,
      password: PASSWORD,
      priorExpiresAt: PRIOR_EXPIRY,
    })
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(SUPABASE, PASSWORD_RESET_AUDIT)
    expect(result).toEqual({ ok: true })
  })

  it('sends the email to the recipient with the newly generated password', async () => {
    mockIssueTempPassword.mockResolvedValue('issued')
    mockSendEmail.mockResolvedValue({ ok: true })

    await issueAndEmailPassword(OPTS)

    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'alice@example.com' }))
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    // toHaveBeenCalledTimes(1) above guarantees this call exists.
    const call = mockSendEmail.mock.calls[0]![0]
    expect(call.html).toContain(PASSWORD)
    expect(call.text).toContain(PASSWORD)
  })

  it('does not send an email when issuing the password fails', async () => {
    mockIssueTempPassword.mockResolvedValue('failed')

    const result = await issueAndEmailPassword(OPTS)

    expect(result).toEqual({
      ok: false,
      result: { success: false, error: 'Failed to send login instructions' },
    })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockRecordAuthEvent).not.toHaveBeenCalled()
  })

  it('does not send an email when the password was issued but not re-armed', async () => {
    mockIssueTempPassword.mockResolvedValue('issued_not_armed')

    const result = await issueAndEmailPassword(OPTS)

    expect(result).toEqual({
      ok: false,
      result: {
        success: false,
        error: 'Password was changed but not marked temporary. Send again.',
      },
    })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(SUPABASE, PASSWORD_RESET_AUDIT)
  })

  it('reports a send failure and logs when the email fails to send', async () => {
    mockIssueTempPassword.mockResolvedValue('issued')
    mockSendEmail.mockResolvedValue({ ok: false, error: 'rate limited' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await issueAndEmailPassword(OPTS)

    expect(result).toEqual({
      ok: false,
      result: {
        success: false,
        error: 'The password was replaced but the email could not be sent. Send again.',
      },
    })
    expect(errorSpy).toHaveBeenCalledWith('[sendLoginInstructions] send failed:', 'rate limited')
    expect(mockRecordAuthEvent).toHaveBeenCalledWith(SUPABASE, PASSWORD_RESET_AUDIT)
    errorSpy.mockRestore()
  })
})
