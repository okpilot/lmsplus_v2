import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
})

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))

import { findAuthUserByEmail, passwordAuthenticates, resetPasswordIfDrifted } from './auth-users'

beforeEach(() => {
  vi.resetAllMocks()
})

type ListUsersPage = {
  data: { users: Array<{ id: string; email: string }> } | null
  error?: { message: string } | null
}

function buildAdminMock(listUsersImpl: (page: number) => ListUsersPage) {
  const listUsersMock = vi.fn((args: { page: number; perPage: number }) =>
    Promise.resolve(listUsersImpl(args.page)),
  )
  return { auth: { admin: { listUsers: listUsersMock } } }
}

function buildFillerPage(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `filler-${i}`,
    email: `filler-${i}@lmsplus.local`,
  }))
}

describe('findAuthUserByEmail', () => {
  it('returns the matching user found on page 1', async () => {
    const admin = buildAdminMock(() => ({
      data: { users: [{ id: 'match-id', email: 'target@lmsplus.local' }] },
    }))

    const result = await findAuthUserByEmail(
      admin as unknown as Parameters<typeof findAuthUserByEmail>[0],
      'target@lmsplus.local',
    )

    expect(result).toEqual({ id: 'match-id', email: 'target@lmsplus.local' })
    expect(admin.auth.admin.listUsers).toHaveBeenCalledTimes(1)
  })

  it('finds a match on page 2 after a full page of non-matching users on page 1', async () => {
    const admin = buildAdminMock((page) =>
      page === 1
        ? { data: { users: buildFillerPage(200) } }
        : { data: { users: [{ id: 'match-id', email: 'target@lmsplus.local' }] } },
    )

    const result = await findAuthUserByEmail(
      admin as unknown as Parameters<typeof findAuthUserByEmail>[0],
      'target@lmsplus.local',
    )

    expect(result).toEqual({ id: 'match-id', email: 'target@lmsplus.local' })
    expect(admin.auth.admin.listUsers).toHaveBeenCalledTimes(2)
  })

  it('returns undefined when a short page (below full page size) has no match', async () => {
    const admin = buildAdminMock(() => ({
      data: { users: buildFillerPage(5) },
    }))

    const result = await findAuthUserByEmail(
      admin as unknown as Parameters<typeof findAuthUserByEmail>[0],
      'target@lmsplus.local',
    )

    expect(result).toBeUndefined()
    expect(admin.auth.admin.listUsers).toHaveBeenCalledTimes(1)
  })

  it('throws a "Could not list users" error when listUsers returns an error', async () => {
    const admin = buildAdminMock(() => ({
      data: null,
      error: { message: 'permission denied' },
    }))

    await expect(
      findAuthUserByEmail(
        admin as unknown as Parameters<typeof findAuthUserByEmail>[0],
        'target@lmsplus.local',
      ),
    ).rejects.toThrow('Could not list users: permission denied')
  })

  it('requests perPage 200 with an increasing page number on each call', async () => {
    const admin = buildAdminMock((page) =>
      page === 1
        ? { data: { users: buildFillerPage(200) } }
        : { data: { users: buildFillerPage(3) } },
    )

    await findAuthUserByEmail(
      admin as unknown as Parameters<typeof findAuthUserByEmail>[0],
      'nonexistent@lmsplus.local',
    )

    expect(admin.auth.admin.listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 200 })
    expect(admin.auth.admin.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 200 })
  })
  it('stops with an error instead of paging forever when every page is full', async () => {
    const admin = buildAdminMock(() => ({ data: { users: buildFillerPage(200) } }))

    await expect(
      findAuthUserByEmail(
        admin as unknown as Parameters<typeof findAuthUserByEmail>[0],
        'nonexistent@lmsplus.local',
      ),
    ).rejects.toThrow('No short page after 50 listUsers pages')
    expect(admin.auth.admin.listUsers).toHaveBeenCalledTimes(50)
  })
})

describe('passwordAuthenticates', () => {
  function mockSignIn(result: unknown) {
    const signInWithPassword = vi.fn().mockResolvedValue(result)
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword } })
    return signInWithPassword
  }

  it('returns true when sign-in succeeds', async () => {
    const signIn = mockSignIn({ error: null })

    await expect(passwordAuthenticates('a@lmsplus.local', 'pw')).resolves.toBe(true)
    expect(signIn).toHaveBeenCalledWith({ email: 'a@lmsplus.local', password: 'pw' })
  })

  it('returns false when sign-in fails with invalid_credentials', async () => {
    mockSignIn({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } })

    await expect(passwordAuthenticates('a@lmsplus.local', 'pw')).resolves.toBe(false)
  })

  it('throws when sign-in fails with a non-credential error', async () => {
    mockSignIn({ error: { code: 'over_request_rate_limit', message: 'rate limited', status: 429 } })

    await expect(passwordAuthenticates('a@lmsplus.local', 'pw')).rejects.toThrow(
      'passwordAuthenticates: rate limited',
    )
  })

  it('throws when the sign-in call itself rejects (network)', async () => {
    const signInWithPassword = vi.fn().mockRejectedValue(new Error('fetch failed'))
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword } })

    await expect(passwordAuthenticates('a@lmsplus.local', 'pw')).rejects.toThrow('fetch failed')
  })

  it('throws when the anon key is missing', async () => {
    const saved = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    try {
      await expect(passwordAuthenticates('a@lmsplus.local', 'pw')).rejects.toThrow(
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is required for E2E tests',
      )
      expect(mockCreateClient).not.toHaveBeenCalled()
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved
    }
  })

  it('creates the anon-key client with session persistence disabled', async () => {
    mockSignIn({ error: null })

    await passwordAuthenticates('a@lmsplus.local', 'pw')

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.any(String),
      'test-anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }),
      }),
    )
  })
})

describe('resetPasswordIfDrifted', () => {
  const args = { id: 'u1', email: 'a@lmsplus.local', password: 'pw', tag: 'tagX' }

  function setup(signInResult: unknown, updateError: { message: string } | null = null) {
    mockCreateClient.mockReturnValue({
      auth: { signInWithPassword: vi.fn().mockResolvedValue(signInResult) },
    })
    const updateUserById = vi.fn().mockResolvedValue({ error: updateError })
    const admin = { auth: { admin: { updateUserById } } }
    return {
      updateUserById,
      admin: admin as unknown as Parameters<typeof resetPasswordIfDrifted>[0],
    }
  }

  it('does not update when the password already signs in', async () => {
    const { admin, updateUserById } = setup({ error: null })

    await resetPasswordIfDrifted(admin, args)

    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('resets the password on invalid_credentials', async () => {
    const { admin, updateUserById } = setup({
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    await resetPasswordIfDrifted(admin, args)

    expect(updateUserById).toHaveBeenCalledWith('u1', { password: 'pw' })
  })

  it('throws the tagged message when the update fails', async () => {
    const { admin } = setup(
      { error: { code: 'invalid_credentials', message: 'Invalid login credentials' } },
      { message: 'boom' },
    )

    await expect(resetPasswordIfDrifted(admin, args)).rejects.toThrow('tagX reset password: boom')
  })
})
