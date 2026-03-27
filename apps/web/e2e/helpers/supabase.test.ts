import { afterEach, describe, expect, it, vi } from 'vitest'

// Set the required env var before the module under test is evaluated
vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '../../lib/consent/versions'
import {
  ensureConsentRecords,
  ensureTestUser,
  getAdminClient,
  TEST_EMAIL,
  TEST_PASSWORD,
} from './supabase'

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
  listUsers?: {
    data: { users: Array<{ id: string; email: string }> } | null
    error?: { message: string } | null
  }
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
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
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

  it('throws when listUsers returns an error', async () => {
    mockCreateClient.mockReturnValue(
      buildMockClient({
        listUsers: { data: null, error: { message: 'permission denied' } },
      }),
    )
    await expect(ensureTestUser()).rejects.toThrow('ensureTestUser listUsers: permission denied')
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
      userRow: { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
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
      userRow: { data: null, error: { message: 'no rows found', code: 'PGRST116' } },
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
      userRow: { data: { id: 'user-wrong-org', organization_id: 'other-org' }, error: null },
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
        userRow: { data: { id: 'user-wrong-org', organization_id: 'other-org' }, error: null },
        updateError: { message: 'foreign key violation' },
      }),
    )

    await expect(ensureTestUser()).rejects.toThrow(
      'ensureTestUser update org: foreign key violation',
    )
  })
})

// ---------------------------------------------------------------------------
// ensureConsentRecords
// ---------------------------------------------------------------------------

/**
 * Builds a client for ensureConsentRecords tests.
 *
 * The production code issues two SELECT queries (one per document type, each
 * filtered by document_version) and then conditionally issues one INSERT.
 * We can't distinguish SELECT from INSERT by table name alone, so we expose
 * separate `select` and `insert` methods on the `user_consents` mock, and
 * track select call order to return type-specific rows.
 */
function buildConsentMockClientWithInsert(opts: {
  consentTosRows?: Array<{ document_type: string }>
  consentPrivacyRows?: Array<{ document_type: string }>
  insertError?: { message: string } | null
}) {
  const { consentTosRows = [], consentPrivacyRows = [], insertError = null } = opts

  const insertMock = vi.fn().mockReturnValue(buildChain({ error: insertError }))

  let selectCallCount = 0

  return {
    client: {
      from: (table: string) => {
        if (table === 'user_consents') {
          return {
            select: () => {
              selectCallCount++
              const callIndex = selectCallCount
              return buildChain(
                callIndex === 1
                  ? { data: consentTosRows, error: null }
                  : { data: consentPrivacyRows, error: null },
              )
            },
            insert: insertMock,
          }
        }
        return buildChain({ data: null, error: null })
      },
      auth: { admin: {} },
    },
    insertMock,
  }
}

describe('ensureConsentRecords', () => {
  it('does not insert when current-version TOS and privacy records already exist', async () => {
    const { client, insertMock } = buildConsentMockClientWithInsert({
      consentTosRows: [{ document_type: 'terms_of_service' }],
      consentPrivacyRows: [{ document_type: 'privacy_policy' }],
    })

    await ensureConsentRecords(client as ReturnType<typeof getAdminClient>, 'user-abc')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts both records when neither exists for the current versions', async () => {
    const { client, insertMock } = buildConsentMockClientWithInsert({
      consentTosRows: [],
      consentPrivacyRows: [],
    })

    await ensureConsentRecords(client as ReturnType<typeof getAdminClient>, 'user-abc')
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          document_type: 'terms_of_service',
          document_version: CURRENT_TOS_VERSION,
          accepted: true,
        }),
        expect.objectContaining({
          document_type: 'privacy_policy',
          document_version: CURRENT_PRIVACY_VERSION,
          accepted: true,
        }),
      ]),
    )
  })

  it('inserts only the privacy record when only TOS already exists at current version', async () => {
    const { client, insertMock } = buildConsentMockClientWithInsert({
      consentTosRows: [{ document_type: 'terms_of_service' }],
      consentPrivacyRows: [],
    })

    await ensureConsentRecords(client as ReturnType<typeof getAdminClient>, 'user-abc')
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ document_type: 'privacy_policy' })]),
    )
    expect(insertMock).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ document_type: 'terms_of_service' })]),
    )
  })

  it('inserts only the TOS record when only privacy already exists at current version', async () => {
    const { client, insertMock } = buildConsentMockClientWithInsert({
      consentTosRows: [],
      consentPrivacyRows: [{ document_type: 'privacy_policy' }],
    })

    await ensureConsentRecords(client as ReturnType<typeof getAdminClient>, 'user-abc')
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ document_type: 'terms_of_service' })]),
    )
    expect(insertMock).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ document_type: 'privacy_policy' })]),
    )
  })

  it('includes the userId in each inserted record', async () => {
    const { client, insertMock } = buildConsentMockClientWithInsert({
      consentTosRows: [],
      consentPrivacyRows: [],
    })

    await ensureConsentRecords(client as ReturnType<typeof getAdminClient>, 'user-xyz')
    expect(insertMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ user_id: 'user-xyz' })]),
    )
  })

  it('throws when the insert fails', async () => {
    const { client } = buildConsentMockClientWithInsert({
      consentTosRows: [],
      consentPrivacyRows: [],
      insertError: { message: 'unique violation' },
    })

    await expect(
      ensureConsentRecords(client as ReturnType<typeof getAdminClient>, 'user-abc'),
    ).rejects.toThrow('ensureConsentRecords: unique violation')
  })
})
