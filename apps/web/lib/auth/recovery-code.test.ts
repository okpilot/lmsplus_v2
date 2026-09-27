import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const { mockAdminFrom, mockGetUserById, mockUpdateUserById, mockGenerateLink } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
  mockGetUserById: vi.fn(),
  mockUpdateUserById: vi.fn(),
  mockGenerateLink: vi.fn(),
}))

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockAdminFrom,
    auth: {
      admin: {
        getUserById: mockGetUserById,
        updateUserById: mockUpdateUserById,
        generateLink: mockGenerateLink,
      },
    },
  },
}))

// ---- Subject under test -------------------------------------------------------

import {
  claimRecoverySlot,
  findActiveUserIdByEmail,
  issueRecoveryCode,
  isVerifyLocked,
  MAX_FAILED_VERIFIES_PER_HOUR,
  MAX_RECOVERY_CODES_PER_HOUR,
  recentSends,
  recordFailedVerify,
} from './recovery-code'

// ---- Helpers ------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const EMAIL = 'student@example.com'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('recentSends', () => {
  const NOW = Date.parse('2026-09-27T12:00:00.000Z')

  it('keeps timestamps within the last hour', () => {
    const withinWindow = new Date(NOW - 30 * 60 * 1000).toISOString()

    expect(recentSends([withinWindow], NOW)).toEqual([withinWindow])
  })

  it('drops timestamps older than an hour', () => {
    const outsideWindow = new Date(NOW - 61 * 60 * 1000).toISOString()

    expect(recentSends([outsideWindow], NOW)).toEqual([])
  })

  it('drops an unparsable timestamp instead of throwing', () => {
    expect(recentSends(['not-a-date'], NOW)).toEqual([])
  })
})

describe('findActiveUserIdByEmail', () => {
  it('returns the id for a matching, non-deleted user', async () => {
    mockAdminFrom.mockImplementation(() => buildChain({ data: { id: USER_ID }, error: null }))

    await expect(findActiveUserIdByEmail(EMAIL)).resolves.toBe(USER_ID)
  })

  it('returns null when no matching row exists', async () => {
    mockAdminFrom.mockImplementation(() => buildChain({ data: null, error: null }))

    await expect(findActiveUserIdByEmail(EMAIL)).resolves.toBeNull()
  })

  it('returns null and logs when the lookup errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'db unreachable' } }),
    )

    await expect(findActiveUserIdByEmail(EMAIL)).resolves.toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[findActiveUserIdByEmail] lookup failed:',
      'db unreachable',
    )
    consoleSpy.mockRestore()
  })

  it('excludes soft-deleted rows from the lookup', async () => {
    const isCalls: unknown[][] = []
    const chain: Record<string, unknown> = {
      ilike: () => chain,
      is: (...args: unknown[]) => {
        isCalls.push(args)
        return chain
      },
      maybeSingle: () => Promise.resolve({ data: { id: USER_ID }, error: null }),
    }
    mockAdminFrom.mockReturnValue({ select: () => chain })

    await expect(findActiveUserIdByEmail(EMAIL)).resolves.toBe(USER_ID)
    expect(isCalls).toEqual([['deleted_at', null]])
  })

  it('finds an account whose stored email differs only in case', async () => {
    const ilikeCalls: unknown[][] = []
    const chain: Record<string, unknown> = {
      ilike: (...args: unknown[]) => {
        ilikeCalls.push(args)
        return chain
      },
      is: () => chain,
      maybeSingle: () => Promise.resolve({ data: { id: USER_ID }, error: null }),
    }
    mockAdminFrom.mockReturnValue({ select: () => chain })

    await expect(findActiveUserIdByEmail('john.doe@example.com')).resolves.toBe(USER_ID)
    expect(ilikeCalls).toEqual([['email', 'john.doe@example.com']])
  })
})

describe('claimRecoverySlot', () => {
  it('allows the send and records the timestamp when under the cap', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    mockUpdateUserById.mockResolvedValue({ error: null })

    await expect(claimRecoverySlot(USER_ID)).resolves.toEqual({ allowed: true })
    expect(mockUpdateUserById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          recovery_code_sent_at: expect.arrayContaining([expect.any(String)]),
        }),
      }),
    )
  })

  it('preserves other app_metadata keys when recording the send', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { provider: 'email' } } },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({ error: null })

    await claimRecoverySlot(USER_ID)

    expect(mockUpdateUserById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ app_metadata: expect.objectContaining({ provider: 'email' }) }),
    )
  })

  it(`refuses once ${MAX_RECOVERY_CODES_PER_HOUR} sends already landed within the last hour`, async () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const recent = Array.from({ length: MAX_RECOVERY_CODES_PER_HOUR }, (_, i) =>
      new Date(now.getTime() - i * 60 * 1000).toISOString(),
    )
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { recovery_code_sent_at: recent } } },
      error: null,
    })

    await expect(claimRecoverySlot(USER_ID)).resolves.toEqual({ allowed: false })
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('allows the send again once earlier timestamps have aged out of the window', async () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const stale = Array.from({ length: MAX_RECOVERY_CODES_PER_HOUR }, () =>
      new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    )
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { recovery_code_sent_at: stale } } },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({ error: null })

    await expect(claimRecoverySlot(USER_ID)).resolves.toEqual({ allowed: true })
    vi.useRealTimers()
  })

  it('refuses and logs when the user cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: 'not found' } })

    await expect(claimRecoverySlot(USER_ID)).resolves.toEqual({ allowed: false })
    expect(consoleSpy).toHaveBeenCalledWith('[claimRecoverySlot] failed to read user:', 'not found')
    consoleSpy.mockRestore()
  })

  it('refuses and logs when recording the send fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    mockUpdateUserById.mockResolvedValue({ error: { message: 'db unreachable' } })

    await expect(claimRecoverySlot(USER_ID)).resolves.toEqual({ allowed: false })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[claimRecoverySlot] failed to record send:',
      'db unreachable',
    )
    consoleSpy.mockRestore()
  })
})

describe('issueRecoveryCode', () => {
  it('returns the email_otp from generateLink', async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { email_otp: '123456' } },
      error: null,
    })

    await expect(issueRecoveryCode(EMAIL)).resolves.toBe('123456')
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: 'recovery', email: EMAIL })
  })

  it('returns null and logs when generateLink errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGenerateLink.mockResolvedValue({ data: null, error: { message: 'rate limited' } })

    await expect(issueRecoveryCode(EMAIL)).resolves.toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[issueRecoveryCode] generateLink failed:',
      'rate limited',
    )
    consoleSpy.mockRestore()
  })

  it('returns null and logs when the response carries no email_otp', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGenerateLink.mockResolvedValue({ data: { properties: {} }, error: null })

    await expect(issueRecoveryCode(EMAIL)).resolves.toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[issueRecoveryCode] generateLink returned no email_otp',
    )
    consoleSpy.mockRestore()
  })
})

describe('isVerifyLocked', () => {
  it('allows verification when the failure count is under the cap', async () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const recent = Array.from({ length: MAX_FAILED_VERIFIES_PER_HOUR - 1 }, (_, i) =>
      new Date(now.getTime() - i * 60 * 1000).toISOString(),
    )
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { recovery_verify_failed_at: recent } } },
      error: null,
    })

    await expect(isVerifyLocked(USER_ID)).resolves.toBe(false)
    vi.useRealTimers()
  })

  it(`locks verification once ${MAX_FAILED_VERIFIES_PER_HOUR} failures landed within the last hour`, async () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const recent = Array.from({ length: MAX_FAILED_VERIFIES_PER_HOUR }, (_, i) =>
      new Date(now.getTime() - i * 60 * 1000).toISOString(),
    )
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { recovery_verify_failed_at: recent } } },
      error: null,
    })

    await expect(isVerifyLocked(USER_ID)).resolves.toBe(true)
    vi.useRealTimers()
  })

  it('allows verification again once earlier failures have aged out of the window', async () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const stale = Array.from({ length: MAX_FAILED_VERIFIES_PER_HOUR }, () =>
      new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    )
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { recovery_verify_failed_at: stale } } },
      error: null,
    })

    await expect(isVerifyLocked(USER_ID)).resolves.toBe(false)
    vi.useRealTimers()
  })

  it('fails closed and logs when the user cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: 'not found' } })

    await expect(isVerifyLocked(USER_ID)).resolves.toBe(true)
    expect(consoleSpy).toHaveBeenCalledWith('[isVerifyLocked] failed to read user:', 'not found')
    consoleSpy.mockRestore()
  })
})

describe('recordFailedVerify', () => {
  it('appends a failed-verify timestamp', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    mockUpdateUserById.mockResolvedValue({ error: null })

    await recordFailedVerify(USER_ID)

    expect(mockUpdateUserById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        app_metadata: expect.objectContaining({
          recovery_verify_failed_at: expect.arrayContaining([expect.any(String)]),
        }),
      }),
    )
  })

  it('preserves other app_metadata keys when recording the failure', async () => {
    mockGetUserById.mockResolvedValue({
      data: { user: { app_metadata: { provider: 'email' } } },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({ error: null })

    await recordFailedVerify(USER_ID)

    expect(mockUpdateUserById).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ app_metadata: expect.objectContaining({ provider: 'email' }) }),
    )
  })

  it('logs and does not throw when the user cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: 'not found' } })

    await expect(recordFailedVerify(USER_ID)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[recordFailedVerify] failed to read user:',
      'not found',
    )
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('logs and does not throw when recording the failure fails to persist', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUserById.mockResolvedValue({ data: { user: { app_metadata: {} } }, error: null })
    mockUpdateUserById.mockResolvedValue({ error: { message: 'db unreachable' } })

    await expect(recordFailedVerify(USER_ID)).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[recordFailedVerify] failed to record failure:',
      'db unreachable',
    )
    consoleSpy.mockRestore()
  })
})
