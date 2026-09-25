import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockAdminUpdateUserById, mockAdminFrom } = vi.hoisted(() => ({
  mockAdminUpdateUserById: vi.fn(),
  mockAdminFrom: vi.fn(),
}))

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    auth: { admin: { updateUserById: mockAdminUpdateUserById } },
    from: mockAdminFrom,
  },
}))

// ---- Subject under test ---------------------------------------------------

import {
  clearTempPassword,
  expireTempPassword,
  readTempPasswordState,
  refuseIfTempPasswordExpired,
} from './temp-password'

// ---- Helpers ----------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

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

function makeSupabaseFrom(returnValue: unknown) {
  return vi.fn().mockImplementation(() => buildChain(returnValue))
}

function makeSupabase(opts: { fromReturn?: unknown; signOutError?: { message: string } | null }) {
  const signOut = vi.fn().mockResolvedValue({ error: opts.signOutError ?? null })
  return {
    from: makeSupabaseFrom(opts.fromReturn ?? { data: null, error: null }),
    auth: { signOut },
  } as unknown as Parameters<typeof readTempPasswordState>[0]
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('readTempPasswordState', () => {
  it('returns none when the column is null', async () => {
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: null }, error: null },
    })

    await expect(readTempPasswordState(supabase, USER_ID)).resolves.toBe('none')
  })

  it('returns none when no row is found', async () => {
    const supabase = makeSupabase({ fromReturn: { data: null, error: null } })

    await expect(readTempPasswordState(supabase, USER_ID)).resolves.toBe('none')
  })

  it('returns active when the expiry is in the future', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: future }, error: null },
    })

    await expect(readTempPasswordState(supabase, USER_ID)).resolves.toBe('active')
  })

  it('returns expired when the expiry has passed', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: past }, error: null },
    })

    await expect(readTempPasswordState(supabase, USER_ID)).resolves.toBe('expired')
  })

  it('throws when the query returns an error', async () => {
    const supabase = makeSupabase({
      fromReturn: { data: null, error: { message: 'connection reset' } },
    })

    await expect(readTempPasswordState(supabase, USER_ID)).rejects.toThrow(
      'Failed to read temp password state: connection reset',
    )
  })
})

describe('expireTempPassword', () => {
  it('scrambles the password to a distinct random value each call and signs out globally', async () => {
    mockAdminUpdateUserById.mockResolvedValue({ error: null })
    const supabase = makeSupabase({})

    await expireTempPassword(supabase, USER_ID)
    const firstPassword = mockAdminUpdateUserById.mock.calls[0]?.[1]?.password as string

    mockAdminUpdateUserById.mockClear()
    await expireTempPassword(supabase, USER_ID)
    const secondPassword = mockAdminUpdateUserById.mock.calls[0]?.[1]?.password as string

    expect(mockAdminUpdateUserById).toHaveBeenCalledWith(USER_ID, { password: secondPassword })
    expect(firstPassword).toHaveLength(43)
    expect(secondPassword).toHaveLength(43)
    expect(firstPassword).not.toBe(secondPassword)
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('still signs out and does not throw when the password scramble fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminUpdateUserById.mockResolvedValue({ error: { message: 'gotrue unavailable' } })
    const supabase = makeSupabase({})

    await expect(expireTempPassword(supabase, USER_ID)).resolves.toBeUndefined()

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[expireTempPassword] password scramble failed:',
      'gotrue unavailable',
    )
    consoleSpy.mockRestore()
  })

  it('logs but does not throw when the global sign-out fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminUpdateUserById.mockResolvedValue({ error: null })
    const supabase = makeSupabase({ signOutError: { message: 'session store down' } })

    await expect(expireTempPassword(supabase, USER_ID)).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[expireTempPassword] global sign-out failed:',
      'session store down',
    )
    consoleSpy.mockRestore()
  })
})

describe('refuseIfTempPasswordExpired', () => {
  it('allows the caller through when the temp password is not expired', async () => {
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: null }, error: null },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('ok')
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled()
  })

  it('scrambles the password and signs out when the temp password has expired', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    mockAdminUpdateUserById.mockResolvedValue({ error: null })
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: past }, error: null },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('expired')
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith(USER_ID, {
      password: expect.any(String),
    })
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('refuses without scrambling the password when the state cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({
      fromReturn: { data: null, error: { message: 'connection reset' } },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('error')
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[refuseIfTempPasswordExpired] state read error:',
      'Failed to read temp password state: connection reset',
    )
    consoleSpy.mockRestore()
  })
})

describe('clearTempPassword', () => {
  it('reports success when a row is updated', async () => {
    mockAdminFrom.mockImplementation(() => buildChain({ data: [{ id: USER_ID }], error: null }))

    await expect(clearTempPassword(USER_ID)).resolves.toEqual({ success: true })
  })

  it('reports failure and logs when the update returns an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'db unreachable' } }),
    )

    await expect(clearTempPassword(USER_ID)).resolves.toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith('[clearTempPassword] update failed:', 'db unreachable')
    consoleSpy.mockRestore()
  })

  it('reports failure and logs when zero rows are updated', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminFrom.mockImplementation(() => buildChain({ data: [], error: null }))

    await expect(clearTempPassword(USER_ID)).resolves.toEqual({ success: false })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[clearTempPassword] zero rows updated for user:',
      USER_ID,
    )
    consoleSpy.mockRestore()
  })
})
