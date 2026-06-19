import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockSend = vi.hoisted(() => vi.fn())

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

// ---- Subject under test ---------------------------------------------------

import { sendEmail } from './resend'

// ---- Helpers ---------------------------------------------------------------

const ARGS = {
  to: 'student@example.com',
  subject: 'Your exam access code',
  html: '<p>code</p>',
  text: 'code',
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sendEmail', () => {
  it('sends via Resend when RESEND_API_KEY and EMAIL_FROM are present', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: true })
    expect(mockSend).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: ARGS.to,
      subject: ARGS.subject,
      html: ARGS.html,
      text: ARGS.text,
    })
  })

  it('logs and returns ok without sending when RESEND_API_KEY is absent', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: true })
    expect(mockSend).not.toHaveBeenCalled()
    // Recipient is redacted in the dev log — no raw PII (student@example.com -> s***@example.com).
    expect(logSpy).toHaveBeenCalledWith('[email] (dev, no RESEND_API_KEY) would send:', {
      to: 's***@example.com',
      subject: ARGS.subject,
    })
    logSpy.mockRestore()
  })

  it('fails loudly without logging PII when RESEND_API_KEY is absent in production', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[sendEmail] RESEND_API_KEY is not set — cannot send email',
    )
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('returns an error and does not send when EMAIL_FROM is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', '')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'EMAIL_FROM not configured' })
    expect(mockSend).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns the error and logs it when the Resend SDK reports an error', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    mockSend.mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(errorSpy).toHaveBeenCalledWith('[sendEmail] Resend error:', 'rate limited')
    errorSpy.mockRestore()
  })

  it('returns send_failed and logs when the Resend SDK throws', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'noreply@example.com')
    mockSend.mockRejectedValue(new Error('network down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail(ARGS)

    expect(result).toEqual({ ok: false, error: 'send_failed' })
    expect(errorSpy).toHaveBeenCalledWith('[sendEmail] Unexpected error:', 'network down')
    errorSpy.mockRestore()
  })
})
