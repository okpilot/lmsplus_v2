import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindAuthUserByEmail, mockGetAdminClient, mockEnsureConsentRecords } = vi.hoisted(
  () => ({
    mockFindAuthUserByEmail: vi.fn(),
    mockGetAdminClient: vi.fn(),
    mockEnsureConsentRecords: vi.fn(),
  }),
)

vi.mock('./auth-users', () => ({
  findAuthUserByEmail: (...args: unknown[]) => mockFindAuthUserByEmail(...args),
}))

vi.mock('./supabase', () => ({
  getAdminClient: (...args: unknown[]) => mockGetAdminClient(...args),
  ensureConsentRecords: (...args: unknown[]) => mockEnsureConsentRecords(...args),
}))

import {
  cleanupLinkStudents,
  createLinkStudent,
  E2E_SET_PASSWORD_LINK_EMAIL_PREFIX,
  issueSetPasswordLink,
  readPendingMarker,
  softDeleteLinkStudent,
} from './set-password-link'

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

const ORG_ROW = { data: { id: 'org-123' }, error: null }

type Mocks = {
  upsert?: ReturnType<typeof vi.fn>
  consentDelete?: ReturnType<typeof vi.fn>
  createUser?: ReturnType<typeof vi.fn>
}

function adminWith(mocks: Mocks) {
  return {
    from: (table: string) => {
      if (table === 'organizations') return buildChain(ORG_ROW)
      if (table === 'users')
        return { upsert: mocks.upsert ?? vi.fn().mockResolvedValue({ error: null }) }
      if (table === 'user_consents') {
        return {
          delete: () => ({ eq: mocks.consentDelete ?? vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return buildChain({ data: null, error: null })
    },
    auth: { admin: { createUser: mocks.createUser ?? vi.fn() } },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockEnsureConsentRecords.mockResolvedValue(undefined)
})

describe('createLinkStudent', () => {
  it('throws when the org lookup fails', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: { message: 'connection refused' } }),
      auth: { admin: {} },
    })

    await expect(createLinkStudent({ slot: 'a' })).rejects.toThrow(
      'createLinkStudent org lookup: connection refused',
    )
  })

  it('creates a password-less auth user and arms the pending marker for a new slot', async () => {
    mockFindAuthUserByEmail.mockResolvedValue(undefined)
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new-id' } }, error: null })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockGetAdminClient.mockReturnValue(adminWith({ createUser, upsert }))

    const result = await createLinkStudent({ slot: 'fresh' })

    const email = `${E2E_SET_PASSWORD_LINK_EMAIL_PREFIX}fresh@lmsplus.local`
    expect(createUser).toHaveBeenCalledWith({ email, email_confirm: true })
    expect(result).toEqual({ userId: 'new-id', email, orgId: 'org-123' })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-id',
        email,
        deleted_at: null,
        temp_password_expires_at: expect.any(String),
      }),
    )
    expect(mockEnsureConsentRecords).toHaveBeenCalledWith(expect.anything(), 'new-id')
  })

  it('reuses the existing auth user for a known slot without creating another', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id' })
    const createUser = vi.fn()
    mockGetAdminClient.mockReturnValue(adminWith({ createUser }))

    const result = await createLinkStudent({ slot: 'again' })

    expect(createUser).not.toHaveBeenCalled()
    expect(result.userId).toBe('existing-id')
  })

  it('throws when creating the auth user fails', async () => {
    mockFindAuthUserByEmail.mockResolvedValue(undefined)
    const createUser = vi.fn().mockResolvedValue({ data: null, error: { message: 'rate limited' } })
    mockGetAdminClient.mockReturnValue(adminWith({ createUser }))

    await expect(createLinkStudent({ slot: 'a' })).rejects.toThrow(
      'createLinkStudent auth: rate limited',
    )
  })

  it('throws when the users upsert fails', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id' })
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'constraint' } })
    mockGetAdminClient.mockReturnValue(adminWith({ upsert }))

    await expect(createLinkStudent({ slot: 'a' })).rejects.toThrow(
      'createLinkStudent public: constraint',
    )
  })

  it('removes consent records instead of seeding them when consented is false', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id' })
    const consentDelete = vi.fn().mockResolvedValue({ error: null })
    mockGetAdminClient.mockReturnValue(adminWith({ consentDelete }))

    await createLinkStudent({ slot: 'a', consented: false })

    expect(consentDelete).toHaveBeenCalledWith('user_id', 'existing-id')
    expect(mockEnsureConsentRecords).not.toHaveBeenCalled()
  })

  it('throws when clearing consent records fails', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id' })
    const consentDelete = vi.fn().mockResolvedValue({ error: { message: 'locked' } })
    mockGetAdminClient.mockReturnValue(adminWith({ consentDelete }))

    await expect(createLinkStudent({ slot: 'a', consented: false })).rejects.toThrow(
      'createLinkStudent clear consents: locked',
    )
  })
})

describe('issueSetPasswordLink', () => {
  it('returns the link path carrying the hashed token and recovery type', async () => {
    const generateLink = vi.fn().mockResolvedValue({
      data: { properties: { hashed_token: 'abc123def' } },
      error: null,
    })
    mockGetAdminClient.mockReturnValue({ auth: { admin: { generateLink } } })

    const result = await issueSetPasswordLink('s@lmsplus.local')

    expect(generateLink).toHaveBeenCalledWith({ type: 'recovery', email: 's@lmsplus.local' })
    expect(result).toEqual({
      path: '/auth/set-password?token_hash=abc123def&type=recovery',
      tokenHash: 'abc123def',
    })
  })

  it('throws when generateLink fails', async () => {
    mockGetAdminClient.mockReturnValue({
      auth: {
        admin: {
          generateLink: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
        },
      },
    })

    await expect(issueSetPasswordLink('s@lmsplus.local')).rejects.toThrow(
      'issueSetPasswordLink: boom',
    )
  })

  it('throws when the response carries no hashed token', async () => {
    mockGetAdminClient.mockReturnValue({
      auth: {
        admin: {
          generateLink: vi.fn().mockResolvedValue({ data: { properties: {} }, error: null }),
        },
      },
    })

    await expect(issueSetPasswordLink('s@lmsplus.local')).rejects.toThrow('no hashed_token')
  })
})

describe('readPendingMarker', () => {
  it('returns the stored timestamp', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () =>
        buildChain({ data: { temp_password_expires_at: '2026-10-25T00:00:00Z' }, error: null }),
    })

    expect(await readPendingMarker('u1')).toBe('2026-10-25T00:00:00Z')
  })

  it('returns null when the column is cleared', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: { temp_password_expires_at: null }, error: null }),
    })

    expect(await readPendingMarker('u1')).toBeNull()
  })

  it('throws on a read error', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: { message: 'denied' } }),
    })

    await expect(readPendingMarker('u1')).rejects.toThrow('readPendingMarker: denied')
  })
})

describe('softDeleteLinkStudent', () => {
  it('throws when no live row was updated', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: [], error: null }),
    })

    await expect(softDeleteLinkStudent('u1')).rejects.toThrow('no live row for u1')
  })

  it('throws on an update error', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: { message: 'denied' } }),
    })

    await expect(softDeleteLinkStudent('u1')).rejects.toThrow('softDeleteLinkStudent: denied')
  })

  it('resolves when a live row was soft-deleted', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: [{ id: 'u1' }], error: null }),
    })

    await expect(softDeleteLinkStudent('u1')).resolves.toBeUndefined()
  })
})

describe('cleanupLinkStudents', () => {
  it('does nothing and stays silent when there are no slot students', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetAdminClient.mockReturnValue({ from: () => buildChain({ data: [], error: null }) })

    await expect(cleanupLinkStudents()).resolves.toBeUndefined()
    expect(log).not.toHaveBeenCalled()
  })

  it('throws with the list error surfaced', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: { message: 'list down' } }),
    })

    await expect(cleanupLinkStudents()).rejects.toThrow('cleanupLinkStudents: list: list down')
  })

  it('throws with the soft-delete error surfaced', async () => {
    const queue = [
      { data: [{ id: 'u1' }], error: null },
      { data: null, error: { message: 'update down' } },
    ]
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain(queue.shift()),
    })

    await expect(cleanupLinkStudents()).rejects.toThrow(
      'cleanupLinkStudents: soft-delete: update down',
    )
  })

  it('logs the count when rows were soft-deleted', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const queue = [
      { data: [{ id: 'u1' }, { id: 'u2' }], error: null },
      { data: [{ id: 'u1' }, { id: 'u2' }], error: null },
    ]
    mockGetAdminClient.mockReturnValue({ from: () => buildChain(queue.shift()) })

    await cleanupLinkStudents()

    expect(log).toHaveBeenCalledWith('[cleanupLinkStudents] soft-deleted 2 student(s)')
  })
})
