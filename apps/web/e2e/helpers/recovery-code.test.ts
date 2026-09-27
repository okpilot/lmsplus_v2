import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockUpdateUserById } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUpdateUserById: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: () => ({
    from: mockFrom,
    auth: { admin: { updateUserById: mockUpdateUserById } },
  }),
}))

import { resetRecoveryThrottle } from './recovery-code'

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
