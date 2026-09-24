import { beforeEach, describe, expect, it, vi } from 'vitest'

// Set the required env var before the module under test is evaluated
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

import { ensureNoConsentUser, removeNoConsentUser } from './no-consent-user'

// Chainable Supabase mock (copied pattern from supabase.test.ts)

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

const TEST_USER = {
  email: 'no-consent@lmsplus.local',
  password: 'pw123456!',
  fullName: 'No Consent',
}

type ListUsersResult = {
  data: { users: Array<{ id: string; email: string }> } | null
  error?: { message: string } | null
}

type EnsureMockOptions = {
  org?: { data: { id: string } | null; error: { message: string } | null }
  listUsers?: ListUsersResult
  /** Per-page override for pagination tests — takes priority over `listUsers`. */
  listUsersImpl?: (page: number) => ListUsersResult
  createUser?: { data: { user: { id: string } } | null; error: { message: string } | null }
  resetError?: { message: string } | null
  consentDeleteError?: { message: string } | null
  userRow?: {
    data: { id: string; organization_id: string } | null
    error?: { message: string; code?: string } | null
  }
  insertError?: { message: string } | null
  updateError?: { message: string } | null
}

function buildConsentTableMock(consentDeleteError: { message: string } | null) {
  const consentDeleteEqMock = vi.fn().mockResolvedValue({ error: consentDeleteError })
  const consentDeleteMock = vi.fn().mockReturnValue({ eq: consentDeleteEqMock })
  return { consentDeleteMock, consentDeleteEqMock }
}

function buildUsersTableMock(
  userRow: EnsureMockOptions['userRow'],
  insertError: { message: string } | null,
  updateError: { message: string } | null,
) {
  const usersInsertMock = vi.fn().mockResolvedValue({ error: insertError })
  const usersUpdateEqMock = vi.fn().mockResolvedValue({ error: updateError })
  const usersUpdateMock = vi.fn().mockReturnValue({ eq: usersUpdateEqMock })
  const table = {
    select: () => buildChain(userRow),
    insert: usersInsertMock,
    update: usersUpdateMock,
  }
  return { table, usersInsertMock, usersUpdateMock, usersUpdateEqMock }
}

function buildListUsersMock(
  listUsers: ListUsersResult,
  listUsersImpl: EnsureMockOptions['listUsersImpl'],
) {
  return listUsersImpl
    ? vi.fn((args: { page: number }) => Promise.resolve(listUsersImpl(args.page)))
    : vi.fn().mockResolvedValue(listUsers)
}

function buildEnsureClient(deps: {
  org: EnsureMockOptions['org']
  usersTable: ReturnType<typeof buildUsersTableMock>['table']
  consentDeleteMock: ReturnType<typeof buildConsentTableMock>['consentDeleteMock']
  listUsersMock: ReturnType<typeof buildListUsersMock>
  createUser: EnsureMockOptions['createUser']
  resetError: { message: string } | null
}) {
  const { org, usersTable, consentDeleteMock, listUsersMock, createUser, resetError } = deps
  return {
    from: (table: string) => {
      if (table === 'organizations') return buildChain(org)
      if (table === 'user_consents') return { delete: consentDeleteMock }
      if (table === 'users') return usersTable
      return buildChain({ data: null, error: null })
    },
    auth: {
      admin: {
        listUsers: listUsersMock,
        createUser: vi.fn().mockResolvedValue(createUser),
        updateUserById: vi.fn().mockResolvedValue({ error: resetError }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  }
}

function resolveEnsureDefaults(opts: EnsureMockOptions) {
  return {
    org: opts.org ?? { data: { id: 'org-123' }, error: null },
    listUsers: opts.listUsers ?? { data: { users: [] } },
    listUsersImpl: opts.listUsersImpl,
    createUser: opts.createUser ?? { data: { user: { id: 'new-user-id' } }, error: null },
    resetError: opts.resetError ?? null,
    consentDeleteError: opts.consentDeleteError ?? null,
    userRow: opts.userRow ?? { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
    insertError: opts.insertError ?? null,
    updateError: opts.updateError ?? null,
  }
}

function buildEnsureTableMocks(opts: EnsureMockOptions) {
  const d = resolveEnsureDefaults(opts)
  const { consentDeleteMock, consentDeleteEqMock } = buildConsentTableMock(d.consentDeleteError)
  const {
    table: usersTable,
    usersInsertMock,
    usersUpdateMock,
    usersUpdateEqMock,
  } = buildUsersTableMock(d.userRow, d.insertError, d.updateError)
  const listUsersMock = buildListUsersMock(d.listUsers, d.listUsersImpl)

  return {
    org: d.org,
    createUser: d.createUser,
    resetError: d.resetError,
    usersTable,
    consentDeleteMock,
    consentDeleteEqMock,
    usersInsertMock,
    usersUpdateMock,
    usersUpdateEqMock,
    listUsersMock,
  }
}

function buildEnsureMockClient(opts: EnsureMockOptions) {
  const mocks = buildEnsureTableMocks(opts)
  const client = buildEnsureClient(mocks)
  return { client, ...mocks }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ensureNoConsentUser

describe('ensureNoConsentUser', () => {
  it('throws when the org lookup query fails', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({ org: { data: null, error: { message: 'connection refused' } } })
        .client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser org lookup: connection refused',
    )
  })

  it('throws when the org is not found', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({ org: { data: null, error: null } }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow('ensureNoConsentUser org lookup:')
  })

  it('throws when listUsers returns an error', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: null, error: { message: 'permission denied' } },
      }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'Could not list users: permission denied',
    )
  })

  it('creates a new auth user and public row when no matching auth user exists', async () => {
    const mock = buildEnsureMockClient({
      listUsers: { data: { users: [] } },
      createUser: { data: { user: { id: 'new-user-id' } }, error: null },
      userRow: { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
    })
    mockCreateClient.mockReturnValue(mock.client)

    const userId = await ensureNoConsentUser(TEST_USER)

    expect(mock.client.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: TEST_USER.email, email_confirm: true }),
    )
    expect(mock.usersInsertMock).toHaveBeenCalledWith({
      id: 'new-user-id',
      organization_id: 'org-123',
      email: TEST_USER.email,
      full_name: TEST_USER.fullName,
      role: 'student',
    })
    expect(userId).toBe('new-user-id')
  })

  it('finds an existing auth user whose email only appears on page 2 of listUsers', async () => {
    const page1Users = Array.from({ length: 200 }, (_, i) => ({
      id: `filler-${i}`,
      email: `filler-${i}@lmsplus.local`,
    }))
    const mock = buildEnsureMockClient({
      listUsersImpl: (page) =>
        page === 1
          ? { data: { users: page1Users } }
          : { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
      userRow: { data: { id: 'existing-id', organization_id: 'org-123' }, error: null },
    })
    mockCreateClient.mockReturnValue(mock.client)

    const userId = await ensureNoConsentUser(TEST_USER)

    expect(mock.listUsersMock).toHaveBeenCalledTimes(2)
    expect(mock.client.auth.admin.updateUserById).toHaveBeenCalledWith('existing-id', {
      password: TEST_USER.password,
    })
    expect(userId).toBe('existing-id')
  })

  it('throws when new auth user creation fails', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: { users: [] } },
        createUser: { data: null, error: { message: 'email already registered' } },
      }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser auth: email already registered',
    )
  })

  it('throws when the public users insert fails for a new user', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: { users: [] } },
        createUser: { data: { user: { id: 'new-user-id' } }, error: null },
        userRow: { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
        insertError: { message: 'duplicate key value' },
      }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser public: duplicate key value',
    )
  })

  it('resets the password and clears consent records for an existing auth user', async () => {
    const mock = buildEnsureMockClient({
      listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
      userRow: { data: { id: 'existing-id', organization_id: 'org-123' }, error: null },
    })
    mockCreateClient.mockReturnValue(mock.client)

    const userId = await ensureNoConsentUser(TEST_USER)

    expect(mock.client.auth.admin.updateUserById).toHaveBeenCalledWith('existing-id', {
      password: TEST_USER.password,
    })
    expect(mock.consentDeleteMock).toHaveBeenCalled()
    expect(mock.consentDeleteEqMock).toHaveBeenCalledWith('user_id', 'existing-id')
    expect(userId).toBe('existing-id')
  })

  it('throws when resetting the existing user password fails', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
        resetError: { message: 'rate limited' },
        userRow: { data: { id: 'existing-id', organization_id: 'org-123' }, error: null },
      }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser reset password: rate limited',
    )
  })

  it('throws when clearing consent records fails for an existing user', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
        consentDeleteError: { message: 'rls denied' },
        userRow: { data: { id: 'existing-id', organization_id: 'org-123' }, error: null },
      }).client,
    )

    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser clear consents: rls denied',
    )
  })

  it('throws when the public users lookup fails with a non-not-found error', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
        userRow: { data: null, error: { message: 'connection refused', code: '500' } },
      }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser user lookup: connection refused',
    )
  })

  it('inserts a public users row when the public row is not found (PGRST116)', async () => {
    const mock = buildEnsureMockClient({
      listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
      userRow: { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
    })
    mockCreateClient.mockReturnValue(mock.client)

    const userId = await ensureNoConsentUser(TEST_USER)

    expect(mock.usersInsertMock).toHaveBeenCalledWith({
      id: 'existing-id',
      organization_id: 'org-123',
      email: TEST_USER.email,
      full_name: TEST_USER.fullName,
      role: 'student',
    })
    expect(userId).toBe('existing-id')
  })

  it('updates the organization when the existing public row belongs to a different org', async () => {
    const mock = buildEnsureMockClient({
      listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
      userRow: { data: { id: 'existing-id', organization_id: 'other-org' }, error: null },
    })
    mockCreateClient.mockReturnValue(mock.client)

    const userId = await ensureNoConsentUser(TEST_USER)

    expect(mock.usersUpdateMock).toHaveBeenCalledWith({ organization_id: 'org-123' })
    expect(mock.usersUpdateEqMock).toHaveBeenCalledWith('id', 'existing-id')
    expect(userId).toBe('existing-id')
  })

  it('throws when the organization update fails', async () => {
    mockCreateClient.mockReturnValue(
      buildEnsureMockClient({
        listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
        userRow: { data: { id: 'existing-id', organization_id: 'other-org' }, error: null },
        updateError: { message: 'foreign key violation' },
      }).client,
    )
    await expect(ensureNoConsentUser(TEST_USER)).rejects.toThrow(
      'ensureNoConsentUser update org: foreign key violation',
    )
  })

  it('does not insert or update when the existing public row already matches the org', async () => {
    const mock = buildEnsureMockClient({
      listUsers: { data: { users: [{ id: 'existing-id', email: TEST_USER.email }] } },
      userRow: { data: { id: 'existing-id', organization_id: 'org-123' }, error: null },
    })
    mockCreateClient.mockReturnValue(mock.client)

    const userId = await ensureNoConsentUser(TEST_USER)

    expect(mock.usersInsertMock).not.toHaveBeenCalled()
    expect(mock.usersUpdateMock).not.toHaveBeenCalled()
    expect(userId).toBe('existing-id')
  })
})

// removeNoConsentUser

type RemoveMockOptions = {
  listUsers?: ListUsersResult
  consentDeleteError?: { message: string } | null
  deleteUserError?: { message: string } | null
}

function buildRemoveMockClient(opts: RemoveMockOptions) {
  const {
    listUsers = { data: { users: [] } },
    consentDeleteError = null,
    deleteUserError = null,
  } = opts

  const deleteUserMock = vi.fn().mockResolvedValue({ error: deleteUserError })
  const consentDeleteMock = vi.fn().mockReturnValue(buildChain({ error: consentDeleteError }))

  return {
    client: {
      from: (table: string) => {
        if (table === 'user_consents') return { delete: consentDeleteMock }
        return buildChain({ data: null, error: null })
      },
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(listUsers),
          deleteUser: deleteUserMock,
        },
      },
    },
    deleteUserMock,
    consentDeleteMock,
  }
}

describe('removeNoConsentUser', () => {
  it('warns and does not attempt any delete when the user is not found', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, deleteUserMock, consentDeleteMock } = buildRemoveMockClient({
      listUsers: { data: { users: [] } },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(removeNoConsentUser(TEST_USER.email)).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith('[afterAll] no-consent user not found:', TEST_USER.email)
    expect(deleteUserMock).not.toHaveBeenCalled()
    expect(consentDeleteMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('throws an aggregated error when listUsers fails', async () => {
    const { client } = buildRemoveMockClient({
      listUsers: { data: null, error: { message: 'permission denied' } },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(removeNoConsentUser(TEST_USER.email)).rejects.toThrow(
      'afterAll: Could not list users: permission denied',
    )
  })

  it('still attempts to delete the auth user when clearing consent records fails, then throws', async () => {
    const { client, deleteUserMock } = buildRemoveMockClient({
      listUsers: { data: { users: [{ id: 'user-id', email: TEST_USER.email }] } },
      consentDeleteError: { message: 'rls denied' },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(removeNoConsentUser(TEST_USER.email)).rejects.toThrow(
      'afterAll: afterAll delete consent records: rls denied',
    )
    expect(deleteUserMock).toHaveBeenCalledWith('user-id')
  })

  it('logs but does not throw when the best-effort auth-user delete fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = buildRemoveMockClient({
      listUsers: { data: { users: [{ id: 'user-id', email: TEST_USER.email }] } },
      deleteUserError: { message: 'immutable fk reference' },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(removeNoConsentUser(TEST_USER.email)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith(
      '[afterAll] best-effort auth-user delete failed:',
      'immutable fk reference',
    )
    errorSpy.mockRestore()
  })

  it('completes silently on the happy path', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, deleteUserMock, consentDeleteMock } = buildRemoveMockClient({
      listUsers: { data: { users: [{ id: 'user-id', email: TEST_USER.email }] } },
    })
    mockCreateClient.mockReturnValue(client)

    await expect(removeNoConsentUser(TEST_USER.email)).resolves.toBeUndefined()

    expect(consentDeleteMock).toHaveBeenCalled()
    expect(deleteUserMock).toHaveBeenCalledWith('user-id')
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
