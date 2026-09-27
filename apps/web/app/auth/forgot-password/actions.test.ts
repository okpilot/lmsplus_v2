import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const {
  mockVerifyOtp,
  mockCookiesSet,
  mockCookies,
  mockFindActiveUserIdByEmail,
  mockClaimRecoverySlot,
  mockIssueRecoveryCode,
  mockIsVerifyLocked,
  mockRecordFailedVerify,
  mockIsEmailConfigured,
  mockSendEmail,
  mockRecoveryCodeEmail,
  mockAfter,
  mockWithMinimumDuration,
} = vi.hoisted(() => ({
  mockVerifyOtp: vi.fn(),
  mockCookiesSet: vi.fn(),
  mockCookies: vi.fn(),
  mockFindActiveUserIdByEmail: vi.fn(),
  mockClaimRecoverySlot: vi.fn(),
  mockIssueRecoveryCode: vi.fn(),
  mockIsVerifyLocked: vi.fn(),
  mockRecordFailedVerify: vi.fn(),
  mockIsEmailConfigured: vi.fn(),
  mockSendEmail: vi.fn(),
  mockRecoveryCodeEmail: vi.fn(),
  mockAfter: vi.fn(),
  mockWithMinimumDuration: vi.fn((...args: unknown[]) => args[0]),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { verifyOtp: mockVerifyOtp },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}))

vi.mock('next/server', () => ({
  after: mockAfter,
}))

vi.mock('@/lib/auth/recovery-code', () => ({
  findActiveUserIdByEmail: (...args: unknown[]) => mockFindActiveUserIdByEmail(...args),
  claimRecoverySlot: (...args: unknown[]) => mockClaimRecoverySlot(...args),
  issueRecoveryCode: (...args: unknown[]) => mockIssueRecoveryCode(...args),
  isVerifyLocked: (...args: unknown[]) => mockIsVerifyLocked(...args),
  recordFailedVerify: (...args: unknown[]) => mockRecordFailedVerify(...args),
}))

vi.mock('@/lib/email/resend', () => ({
  isEmailConfigured: () => mockIsEmailConfigured(),
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

vi.mock('@/lib/email/templates/recovery-code', () => ({
  recoveryCodeEmail: (...args: unknown[]) => mockRecoveryCodeEmail(...args),
}))

vi.mock('@/lib/utils/with-minimum-duration', () => ({
  withMinimumDuration: (...args: unknown[]) => mockWithMinimumDuration(...args),
}))

// ---- Subject under test -------------------------------------------------------

import { requestRecoveryCode, verifyRecoveryCode } from './actions'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const EMAIL = 'student@example.com'
const CODE = '123456'

/** `after()` schedules its callback; runs it immediately so send-path assertions can await it. */
async function runScheduledCallbacks(): Promise<void> {
  for (const call of mockAfter.mock.calls) {
    await call[0]()
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockCookies.mockResolvedValue({ set: mockCookiesSet })
  mockIsEmailConfigured.mockReturnValue(true)
  mockFindActiveUserIdByEmail.mockResolvedValue(USER_ID)
  mockClaimRecoverySlot.mockResolvedValue({ allowed: true })
  mockIssueRecoveryCode.mockResolvedValue(CODE)
  mockRecoveryCodeEmail.mockReturnValue({ subject: 's', html: 'h', text: 't' })
  mockSendEmail.mockResolvedValue({ ok: true })
  mockIsVerifyLocked.mockResolvedValue(false)
  mockWithMinimumDuration.mockImplementation((...args: unknown[]) => args[0])
})

describe('requestRecoveryCode', () => {
  it('returns an invalid-email error for malformed input without looking anything up', async () => {
    const result = await requestRecoveryCode({ email: 'not-an-email' })

    expect(result).toEqual({ ok: false, error: 'Invalid email' })
    expect(mockFindActiveUserIdByEmail).not.toHaveBeenCalled()
  })

  it('sends the code and reports ok when everything succeeds', async () => {
    const result = await requestRecoveryCode({ email: EMAIL })
    await runScheduledCallbacks()

    expect(result).toEqual({ ok: true })
    expect(mockIssueRecoveryCode).toHaveBeenCalledWith(EMAIL)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }))
  })

  it('schedules the send to run after the response instead of awaiting it inline', async () => {
    await requestRecoveryCode({ email: EMAIL })

    expect(mockAfter).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('finds the account when the email is typed with capitals and spaces', async () => {
    await requestRecoveryCode({ email: '  Student@Example.COM ' })
    await runScheduledCallbacks()

    expect(mockFindActiveUserIdByEmail).toHaveBeenCalledWith(EMAIL)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: EMAIL }))
  })

  it('reports ok without scheduling a send when no account matches the email', async () => {
    mockFindActiveUserIdByEmail.mockResolvedValue(null)

    const result = await requestRecoveryCode({ email: EMAIL })

    expect(result).toEqual({ ok: true })
    expect(mockAfter).not.toHaveBeenCalled()
    expect(mockClaimRecoverySlot).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('reports ok without sending when email sending is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await requestRecoveryCode({ email: EMAIL })
    await runScheduledCallbacks()

    expect(result).toEqual({ ok: true })
    expect(mockClaimRecoverySlot).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('reports ok without sending when the account is throttled', async () => {
    mockClaimRecoverySlot.mockResolvedValue({ allowed: false })

    const result = await requestRecoveryCode({ email: EMAIL })
    await runScheduledCallbacks()

    expect(result).toEqual({ ok: true })
    expect(mockIssueRecoveryCode).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('reports ok without sending when generating the code fails', async () => {
    mockIssueRecoveryCode.mockResolvedValue(null)

    const result = await requestRecoveryCode({ email: EMAIL })
    await runScheduledCallbacks()

    expect(result).toEqual({ ok: true })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('reports ok and logs when the send itself fails', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, error: 'send_failed' })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await requestRecoveryCode({ email: EMAIL })
    await runScheduledCallbacks()

    expect(result).toEqual({ ok: true })
    expect(consoleSpy).toHaveBeenCalledWith('[requestRecoveryCode] send failed:', 'send_failed')
    consoleSpy.mockRestore()
  })
})

describe('verifyRecoveryCode', () => {
  it('returns an invalid-code error for malformed input without calling verifyOtp', async () => {
    const result = await verifyRecoveryCode({ email: EMAIL, code: 'abc' })

    expect(result).toEqual({ ok: false, error: 'That code is invalid or has expired.' })
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('sets the recovery-pending cookie and reports ok on a valid code', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    const result = await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(result).toEqual({ ok: true })
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: CODE, type: 'recovery' })
    expect(mockCookiesSet).toHaveBeenCalledWith(
      '__recovery_pending',
      '1',
      expect.objectContaining({ httpOnly: true, path: '/', maxAge: 600 }),
    )
  })

  it('verifies against the lowercased email when the email is typed with capitals', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    await verifyRecoveryCode({ email: 'Student@Example.com', code: CODE })

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: CODE, type: 'recovery' })
  })

  it('returns the generic invalid-code error and logs when verifyOtp fails', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(result).toEqual({ ok: false, error: 'That code is invalid or has expired.' })
    expect(mockCookiesSet).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[verifyRecoveryCode] verifyOtp failed:',
      'Token has expired or is invalid',
    )
    consoleSpy.mockRestore()
  })

  it('returns the generic invalid-code error without calling verifyOtp when no account matches', async () => {
    mockFindActiveUserIdByEmail.mockResolvedValue(null)

    const result = await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(result).toEqual({ ok: false, error: 'That code is invalid or has expired.' })
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('returns the generic invalid-code error without calling verifyOtp when the account is locked', async () => {
    mockIsVerifyLocked.mockResolvedValue(true)

    const result = await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(result).toEqual({ ok: false, error: 'That code is invalid or has expired.' })
    expect(mockVerifyOtp).not.toHaveBeenCalled()
  })

  it('records a failed attempt against the account when verifyOtp rejects the code', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(mockRecordFailedVerify).toHaveBeenCalledWith(USER_ID)
    consoleSpy.mockRestore()
  })

  it('runs the verification through the minimum-duration floor', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(mockWithMinimumDuration).toHaveBeenCalledWith(expect.any(Promise), 1500)
  })

  it('asks the student to wait, without counting a failed attempt, when verification is rate-limited', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Too many requests', status: 429 } })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await verifyRecoveryCode({ email: EMAIL, code: CODE })

    expect(result).toEqual({
      ok: false,
      error: 'Too many attempts. Please wait a few minutes and try again.',
    })
    expect(mockRecordFailedVerify).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
