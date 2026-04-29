import { afterEach, describe, expect, it, vi } from 'vitest'

// Set required env vars before the module under test is evaluated
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import {
  ADMIN_TEST_EMAIL,
  ADMIN_TEST_PASSWORD,
  ensureAdminTestUser,
  signInAsAdmin,
} from './admin-supabase'

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// signInAsAdmin
// ---------------------------------------------------------------------------

describe('signInAsAdmin', () => {
  it('creates the client with session persistence disabled', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await signInAsAdmin()

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    )
  })

  it('signs in with the admin email and password', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await signInAsAdmin()

    expect(signInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: ADMIN_TEST_EMAIL,
        password: ADMIN_TEST_PASSWORD,
      }),
    )
  })

  it('returns the authenticated client on success', async () => {
    const fakeClient = { auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } }
    mockCreateClient.mockReturnValue(fakeClient)

    const result = await signInAsAdmin()

    expect(result).toBe(fakeClient)
  })

  it('throws with the Supabase error message when sign-in fails', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: { message: 'Invalid credentials' } })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await expect(signInAsAdmin()).rejects.toThrow('signInAsAdmin: Invalid credentials')
  })

  it('uses the anon key (not service role key) for the client', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await signInAsAdmin()

    // Second argument to createClient must be the anon key, not the service role key
    const [, secondArg] = mockCreateClient.mock.calls[0] as [unknown, string, unknown]
    expect(secondArg).toBe('test-anon-key')
  })
})

// ---------------------------------------------------------------------------
// ensureAdminTestUser — helpers
// ---------------------------------------------------------------------------

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
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

type AdminMockOpts = {
  org?: { data: { id: string } | null; error: { message: string; code?: string } | null }
  userRow?: {
    data: { id: string; organization_id: string; role: string } | null
    error: { message: string; code?: string } | null
  }
  updateUserByIdError?: { message: string } | null
  updateRowError?: { message: string } | null
  createUserResult?: { data: { user: { id: string } } | null; error: { message: string } | null }
  insertError?: { message: string } | null
  deleteUserError?: { message: string } | null
}

function buildAdminMockClient(opts: AdminMockOpts) {
  const {
    org = { data: { id: 'org-123' }, error: null },
    userRow = { data: null, error: { message: 'no rows', code: 'PGRST116' } },
    updateUserByIdError = null,
    updateRowError = null,
    createUserResult = { data: { user: { id: 'new-admin-id' } }, error: null },
    insertError = null,
    deleteUserError = null,
  } = opts

  const updateUserById = vi.fn().mockResolvedValue({ error: updateUserByIdError })
  const createUser = vi.fn().mockResolvedValue(createUserResult)
  const deleteUser = vi.fn().mockResolvedValue({ error: deleteUserError })

  return {
    client: {
      from: (table: string) => {
        if (table === 'organizations') return buildChain(org)
        if (table === 'users') {
          return {
            select: () => buildChain(userRow),
            insert: () => buildChain({ error: insertError }),
            update: () => buildChain({ error: updateRowError }),
          }
        }
        // user_consents — for ensureConsentRecords called at end of happy paths
        return buildChain({ data: [], error: null })
      },
      auth: {
        admin: { updateUserById, createUser, deleteUser },
      },
    },
    updateUserById,
    createUser,
    deleteUser,
  }
}

// ---------------------------------------------------------------------------
// ensureAdminTestUser
// ---------------------------------------------------------------------------

describe('ensureAdminTestUser', () => {
  it('throws when the org is not found', async () => {
    const { client } = buildAdminMockClient({
      org: { data: null, error: null },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow('Egmont Aviation org not found')
  })

  it('throws when the org query itself fails', async () => {
    const { client } = buildAdminMockClient({
      org: { data: null, error: { message: 'connection refused' } },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow(
      'ensureAdminTestUser org query: connection refused',
    )
  })

  it('returns orgId and userId when the admin user already exists with correct role and org', async () => {
    const { client } = buildAdminMockClient({
      userRow: {
        data: { id: 'admin-user-id', organization_id: 'org-123', role: 'admin' },
        error: null,
      },
    })
    mockCreateClient.mockReturnValue(client)

    const result = await ensureAdminTestUser()

    expect(result).toEqual({ orgId: 'org-123', userId: 'admin-user-id' })
  })

  it('resets the password when the admin user already exists', async () => {
    const { client, updateUserById } = buildAdminMockClient({
      userRow: {
        data: { id: 'admin-user-id', organization_id: 'org-123', role: 'admin' },
        error: null,
      },
    })
    mockCreateClient.mockReturnValue(client)

    await ensureAdminTestUser()

    expect(updateUserById).toHaveBeenCalledWith('admin-user-id', {
      password: ADMIN_TEST_PASSWORD,
    })
  })

  it('throws when password reset fails for an existing user', async () => {
    const { client } = buildAdminMockClient({
      userRow: {
        data: { id: 'admin-user-id', organization_id: 'org-123', role: 'admin' },
        error: null,
      },
      updateUserByIdError: { message: 'update auth failed' },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow(
      'ensureAdminTestUser reset password: update auth failed',
    )
  })

  it('throws when the role/org update fails for an existing user with wrong role', async () => {
    const { client } = buildAdminMockClient({
      userRow: {
        data: { id: 'admin-user-id', organization_id: 'org-123', role: 'student' },
        error: null,
      },
      updateRowError: { message: 'row update failed' },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow(
      'ensureAdminTestUser update role/org: row update failed',
    )
  })

  it('throws when the user lookup returns a non-PGRST116 error', async () => {
    const { client } = buildAdminMockClient({
      userRow: {
        data: null,
        error: { message: 'timeout', code: '08001' },
      },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow('ensureAdminTestUser user lookup: timeout')
  })

  it('creates a new auth user and public.users row when the admin user does not exist', async () => {
    const { client, createUser } = buildAdminMockClient({
      userRow: { data: null, error: { message: 'no rows', code: 'PGRST116' } },
      createUserResult: { data: { user: { id: 'brand-new-admin' } }, error: null },
    })
    mockCreateClient.mockReturnValue(client)

    const result = await ensureAdminTestUser()

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: ADMIN_TEST_EMAIL,
        password: ADMIN_TEST_PASSWORD,
        email_confirm: true,
      }),
    )
    expect(result.userId).toBe('brand-new-admin')
  })

  it('throws when auth user creation fails', async () => {
    const { client } = buildAdminMockClient({
      userRow: { data: null, error: { message: 'no rows', code: 'PGRST116' } },
      createUserResult: { data: null, error: { message: 'email already taken' } },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow(
      'ensureAdminTestUser auth: email already taken',
    )
  })

  it('throws and rolls back auth user when public.users insert fails', async () => {
    const { client, deleteUser } = buildAdminMockClient({
      userRow: { data: null, error: { message: 'no rows', code: 'PGRST116' } },
      createUserResult: { data: { user: { id: 'new-admin-id' } }, error: null },
      insertError: { message: 'duplicate key' },
      deleteUserError: null,
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow('ensureAdminTestUser insert: duplicate key')
    expect(deleteUser).toHaveBeenCalledWith('new-admin-id')
  })

  it('includes rollback failure details in the error message when both insert and deleteUser fail', async () => {
    const { client } = buildAdminMockClient({
      userRow: { data: null, error: { message: 'no rows', code: 'PGRST116' } },
      createUserResult: { data: { user: { id: 'new-admin-id' } }, error: null },
      insertError: { message: 'duplicate key' },
      deleteUserError: { message: 'user not found' },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(ensureAdminTestUser()).rejects.toThrow('rollback also failed: user not found')
  })
})
