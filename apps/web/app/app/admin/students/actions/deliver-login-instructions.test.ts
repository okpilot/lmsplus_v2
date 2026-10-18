import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockIssueSetPasswordToken = vi.hoisted(() => vi.fn())
const mockSendEmail = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/recovery-code', () => ({ issueSetPasswordToken: mockIssueSetPasswordToken }))
vi.mock('@/lib/email/resend', () => ({ sendEmail: mockSendEmail }))

// ---- Subject under test -------------------------------------------------------

import { issueAndEmailSetPasswordLink } from './deliver-login-instructions'

// ---- Helpers ------------------------------------------------------------------

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const RECIPIENT = { email: 'alice@example.com', fullName: 'Alice' }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('issueAndEmailSetPasswordLink', () => {
  it('issues a token for the recipient email and emails them a link built from it', async () => {
    mockIssueSetPasswordToken.mockResolvedValue(HASH)
    mockSendEmail.mockResolvedValue({ ok: true })

    const result = await issueAndEmailSetPasswordLink({ recipient: RECIPIENT })

    expect(mockIssueSetPasswordToken).toHaveBeenCalledWith('alice@example.com')
    expect(result).toEqual({ ok: true })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const call = mockSendEmail.mock.calls[0]![0]
    expect(call.to).toBe('alice@example.com')
    expect(call.text).toContain(
      `https://app.example.com/auth/set-password?token_hash=${HASH}&type=recovery`,
    )
    expect(call.text).toContain('https://app.example.com/')
  })

  it('does not email when no token could be issued', async () => {
    mockIssueSetPasswordToken.mockResolvedValue(null)

    const result = await issueAndEmailSetPasswordLink({ recipient: RECIPIENT })

    expect(result).toEqual({
      ok: false,
      result: { success: false, error: 'Failed to send login instructions' },
    })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('reports a send failure without echoing the token, and logs the cause', async () => {
    mockIssueSetPasswordToken.mockResolvedValue(HASH)
    mockSendEmail.mockResolvedValue({ ok: false, error: 'rate limited' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await issueAndEmailSetPasswordLink({ recipient: RECIPIENT })

    expect(result).toEqual({
      ok: false,
      result: { success: false, error: 'The email could not be sent. Send again.' },
    })
    expect(errorSpy).toHaveBeenCalledWith('[sendLoginInstructions] send failed:', 'rate limited')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(HASH)
  })
})
