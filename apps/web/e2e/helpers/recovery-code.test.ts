import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockUpdateUserById, mockGetUserById, mockGenerateLink } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUpdateUserById: vi.fn(),
  mockGetUserById: vi.fn(),
  mockGenerateLink: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: () => ({
    from: mockFrom,
    auth: {
      admin: {
        updateUserById: mockUpdateUserById,
        getUserById: mockGetUserById,
        generateLink: mockGenerateLink,
      },
    },
  }),
}))

import { fetchRecoveryCode, resetRecoveryThrottle } from './recovery-code'

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const EMAIL = 'student@example.com'

function mockUserLookup(result: { data: { id: string } | null; error?: { message: string } }) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(result),
      }),
    }),
  })
}

describe('fetchRecoveryCode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUserLookup({ data: { id: USER_ID } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the OTP once the app send is detected (recovery_sent_at changes)', async () => {
    vi.useFakeTimers()
    mockGetUserById
      .mockResolvedValueOnce({ data: { user: { recovery_sent_at: null } }, error: null })
      .mockResolvedValueOnce({
        data: { user: { recovery_sent_at: '2026-09-27T12:00:00.000Z' } },
        error: null,
      })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { email_otp: '654321' } },
      error: null,
    })

    const result = fetchRecoveryCode(EMAIL)
    await vi.advanceTimersByTimeAsync(200)

    await expect(result).resolves.toBe('654321')
  })

  it('returns the OTP after the settle window passes when the app never sends', async () => {
    vi.useFakeTimers()
    mockGetUserById.mockResolvedValue({ data: { user: { recovery_sent_at: null } }, error: null })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { email_otp: '111222' } },
      error: null,
    })

    const result = fetchRecoveryCode(EMAIL)
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(result).resolves.toBe('111222')
  })

  it('throws when generateLink errors', async () => {
    vi.useFakeTimers()
    mockGetUserById.mockResolvedValue({ data: { user: { recovery_sent_at: null } }, error: null })
    mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'rate limited' } })

    const expectation = expect(fetchRecoveryCode(EMAIL)).rejects.toThrow(
      'fetchRecoveryCode: rate limited',
    )
    await vi.advanceTimersByTimeAsync(3_000)

    await expectation
  })

  it('throws when generateLink returns no email_otp', async () => {
    vi.useFakeTimers()
    mockGetUserById.mockResolvedValue({ data: { user: { recovery_sent_at: null } }, error: null })
    mockGenerateLink.mockResolvedValue({ data: { properties: {} }, error: null })

    const expectation = expect(fetchRecoveryCode(EMAIL)).rejects.toThrow(
      'fetchRecoveryCode: no email_otp on generateLink response',
    )
    await vi.advanceTimersByTimeAsync(3_000)

    await expectation
  })

  it('throws when no user matches the email', async () => {
    mockUserLookup({ data: null })

    await expect(fetchRecoveryCode(EMAIL)).rejects.toThrow(
      `fetchRecoveryCode: no user row for ${EMAIL}`,
    )
    expect(mockGenerateLink).not.toHaveBeenCalled()
  })
})

describe('resetRecoveryThrottle', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('clears both throttle counters on the account matching the email', async () => {
    mockUserLookup({ data: { id: USER_ID } })
    mockUpdateUserById.mockResolvedValue({ error: null })

    await resetRecoveryThrottle(EMAIL)

    expect(mockUpdateUserById).toHaveBeenCalledWith(USER_ID, {
      app_metadata: { recovery_code_sent_at: null, recovery_verify_failed_at: null },
    })
  })

  it('throws when no user matches the email', async () => {
    mockUserLookup({ data: null })

    await expect(resetRecoveryThrottle(EMAIL)).rejects.toThrow(
      `fetchRecoveryCode: no user row for ${EMAIL}`,
    )
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('throws when the user lookup errors', async () => {
    mockUserLookup({ data: null, error: { message: 'db unreachable' } })

    await expect(resetRecoveryThrottle(EMAIL)).rejects.toThrow(
      `fetchRecoveryCode user (${EMAIL}): db unreachable`,
    )
  })

  it('throws when clearing the throttle counters fails', async () => {
    mockUserLookup({ data: { id: USER_ID } })
    mockUpdateUserById.mockResolvedValue({ error: { message: 'db unreachable' } })

    await expect(resetRecoveryThrottle(EMAIL)).rejects.toThrow(
      'resetRecoveryThrottle: db unreachable',
    )
  })
})
