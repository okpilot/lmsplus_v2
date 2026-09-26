import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Subject under test ---------------------------------------------------

import {
  readTempPasswordState,
  refuseIfTempPasswordExpired,
  signOutExpiredTempPassword,
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

  it('throws when the expiry column is not a parseable date', async () => {
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: 'not-a-date' }, error: null },
    })

    await expect(readTempPasswordState(supabase, USER_ID)).rejects.toThrow(
      'Failed to read temp password state: invalid expiry',
    )
  })
})

describe('signOutExpiredTempPassword', () => {
  it('signs out globally without touching the Auth password', async () => {
    const supabase = makeSupabase({})

    await expect(signOutExpiredTempPassword(supabase)).resolves.toBeUndefined()

    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('logs but does not throw when the global sign-out fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({ signOutError: { message: 'session store down' } })

    await expect(signOutExpiredTempPassword(supabase)).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[signOutExpiredTempPassword] global sign-out failed:',
      'session store down',
    )
    consoleSpy.mockRestore()
  })
})

describe('refuseIfTempPasswordExpired', () => {
  it('returns none and signs out no one when there is no temp password', async () => {
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: null }, error: null },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('none')
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('returns active and signs out no one when the temp password has not expired', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: future }, error: null },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('active')
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('returns expired and signs out globally, leaving the Auth password untouched', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const supabase = makeSupabase({
      fromReturn: { data: { temp_password_expires_at: past }, error: null },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('expired')
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('refuses with error and signs out no one when the state cannot be read', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeSupabase({
      fromReturn: { data: null, error: { message: 'connection reset' } },
    })

    await expect(refuseIfTempPasswordExpired(supabase, USER_ID)).resolves.toBe('error')
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[refuseIfTempPasswordExpired] state read error:',
      'Failed to read temp password state: connection reset',
    )
    consoleSpy.mockRestore()
  })
})
