import { afterEach, describe, expect, it, vi } from 'vitest'

// Set the required env var before the module under test is evaluated
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import { TEST_EMAIL, TEST_PASSWORD, ensureTestUser, getAdminClient } from './supabase'

// ---------------------------------------------------------------------------
// Helpers to build a chainable Supabase mock
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

type MockClientOptions = {
  org?: { data: { id: string } | null; error: { message: string; code?: string } | null }
  listUsers?: { data: { users: Array<{ id: string; email: string }> } | null }
  createUser?: { data: { user: { id: string } } | null; error: { message: string } | null }
  userRow?: {
    data: { id: string; organization_id: string } | null
    error?: { message: string; code?: string } | null
  }
  insertError?: { message: string } | null
  updateError?: { message: string } | null
}

function buildMockClient(opts: MockClientOptions) {
  const {
    org = { data: { id: 'org-123' }, error: null },
    listUsers = { data: { users: [] } },
    createUser = { data: { user: { id: 'new-user-id' } }, error: null },
    userRow = { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
    insertError = null,
    updateError = null,
  } = opts

  return {
    from: (table: string) => {
      if (table === 'organizations') return buildChain(org)
      if (table === 'users') {
        // Distinguish select vs. insert vs. update by returning a Proxy
        // that resolves select to userRow, insert to { error: insertError },
        // update to { error: updateError }
        return {
          select: () => buildChain(userRow),
          insert: () => buildChain({ error: insertError }),
          update: () => buildChain({ error: updateError }),
        }
      }
      return buildChain({ data: null })
    },
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue(listUsers),
        createUser: vi.fn().mockResolvedValue(createUser),
      },
    },
  }
}

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
// Constants
// ---------------------------------------------------------------------------

describe('TEST_EMAIL / TEST_PASSWORD', () => {
  it('exports the expected test email', () => {
    expect(TEST_EMAIL).toBe('e2e-test@lmsplus.local')
  })

  it('exports a non-empty test password', () => {
    expect(typeof TEST_PASSWORD).toBe('string')
    expect(TEST_PASSWORD.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// getAdminClient
// ---------------------------------------------------------------------------

describe('getAdminClient', () => {
  it('creates a Supabase client with session persistence disabled', () => {
    mockCreateClient.mockReturnValue({})
    getAdminClient()
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
})

// ---------------------------------------------------------------------------
// ensureTestUser
// ---------------------------------------------------------------------------

describe('ensureTestUser', () => {
  it('throws when the Egmont Aviation org is not found', async () => {
    mockCreateClient.mockReturnValue(buildMockClient({ org: { data: null, error: null } }))
    await expect(ensureTestUser()).rejects.toThrow('Egmont Aviation org not found')
  })

  it('throws when the org lookup query fails', async () => {
    mockCreateClient.mockReturnValue(
      buildMockClient({
        org: { data: null, error: { message: 'connection refused' } },
      }),
    )
    await expect(ensureTestUser()).rejects.toThrow('ensureTestUser org lookup: connection refused')
  })

  it('returns orgId and userId when user already exists in the correct org', async () => {
    mockCreateClient.mockReturnValue(
      buildMockClient({
        listUsers: { data: { users: [{ id: 'existing-user', email: TEST_EMAIL }] } },
        userRow: { data: { id: 'existing-user', organization_id: 'org-123' }, error: null },
      }),
    )

    const result = await ensureTestUser()
    expect(result).toEqual({ orgId: 'org-123', userId: 'existing-user' })
  })

  it('creates a new auth user when no matching auth user exists', async () => {
    const mockClient = buildMockClient({
      listUsers: { data: { users: [] } },
      createUser: { data: { user: { id: 'new-user-id' } }, error: null },
      userRow: { data: null },
    })
    mockCreateClient.mockReturnValue(mockClient)

    const result = await ensureTestUser()
    expect(mockClient.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: TEST_EMAIL,
        email_confirm: true,
      }),
    )
    expect(result.userId).toBe('new-user-id')
  })

  it('throws when auth user creation fails', async () => {
    mockCreateClient.mockReturnValue(
      buildMockClient({
        listUsers: { data: { users: [] } },
        createUser: {
          data: null,
          error: { message: 'Email already registered' },
        },
      }),
    )

    await expect(ensureTestUser()).rejects.toThrow('ensureTestUser auth: Email already registered')
  })

  it('inserts a public users row when auth user exists but no public row is found', async () => {
    const mockClient = buildMockClient({
      listUsers: { data: { users: [{ id: 'user-no-row', email: TEST_EMAIL }] } },
      userRow: { data: null },
      insertError: null,
    })
    mockCreateClient.mockReturnValue(mockClient)

    const result = await ensureTestUser()
    expect(result.userId).toBe('user-no-row')
  })

  it('throws when public users row insert fails', async () => {
    mockCreateClient.mockReturnValue(
      buildMockClient({
        listUsers: { data: { users: [{ id: 'user-no-row', email: TEST_EMAIL }] } },
        userRow: { data: null },
        insertError: { message: 'duplicate key value' },
      }),
    )

    await expect(ensureTestUser()).rejects.toThrow('ensureTestUser public: duplicate key value')
  })

  it('updates organization when user exists in a different org', async () => {
    const mockClient = buildMockClient({
      listUsers: { data: { users: [{ id: 'user-wrong-org', email: TEST_EMAIL }] } },
      userRow: { data: { id: 'user-wrong-org', organization_id: 'other-org' } },
      updateError: null,
    })
    mockCreateClient.mockReturnValue(mockClient)

    const result = await ensureTestUser()
    expect(result.userId).toBe('user-wrong-org')
    expect(result.orgId).toBe('org-123')
  })

  it('throws when organization update fails', async () => {
    mockCreateClient.mockReturnValue(
      buildMockClient({
        listUsers: { data: { users: [{ id: 'user-wrong-org', email: TEST_EMAIL }] } },
        userRow: { data: { id: 'user-wrong-org', organization_id: 'other-org' } },
        updateError: { message: 'foreign key violation' },
      }),
    )

    await expect(ensureTestUser()).rejects.toThrow(
      'ensureTestUser update org: foreign key violation',
    )
  })
})
