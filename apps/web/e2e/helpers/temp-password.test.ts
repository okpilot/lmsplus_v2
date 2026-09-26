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
  cleanupTempPasswordStudents,
  createArmedTempPasswordStudent,
  E2E_TEMP_PASSWORD_EMAIL_PREFIX,
  readTempPasswordExpiresAt,
} from './temp-password'

// Chainable Supabase mock — copied pattern from no-consent-user.test.ts
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

beforeEach(() => {
  vi.resetAllMocks()
  mockEnsureConsentRecords.mockResolvedValue(undefined)
})

describe('createArmedTempPasswordStudent', () => {
  it('throws when the org lookup fails', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: { message: 'connection refused' } }),
      auth: { admin: {} },
    })

    await expect(
      createArmedTempPasswordStudent({ slot: 'a', password: 'pw123456!', expiresInMs: 1000 }),
    ).rejects.toThrow('createArmedTempPasswordStudent org lookup: connection refused')
  })

  it('throws when the org is not found', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: null }),
      auth: { admin: {} },
    })

    await expect(
      createArmedTempPasswordStudent({ slot: 'a', password: 'pw123456!', expiresInMs: 1000 }),
    ).rejects.toThrow('createArmedTempPasswordStudent org lookup:')
  })

  it('resets the auth password for an existing slot user and arms the expiry', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id', email: 'x@y.local' })
    const updateUserByIdMock = vi.fn().mockResolvedValue({ error: null })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockGetAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'organizations') return buildChain(ORG_ROW)
        if (table === 'users') return { upsert: upsertMock }
        return buildChain({ data: null, error: null })
      },
      auth: { admin: { updateUserById: updateUserByIdMock } },
    })

    const result = await createArmedTempPasswordStudent({
      slot: 'reset-slot',
      password: 'pw123456!',
      expiresInMs: 60_000,
    })

    expect(updateUserByIdMock).toHaveBeenCalledWith('existing-id', { password: 'pw123456!' })
    expect(result.userId).toBe('existing-id')
    expect(result.orgId).toBe('org-123')
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing-id',
        organization_id: 'org-123',
        deleted_at: null,
      }),
    )
    expect(mockEnsureConsentRecords).toHaveBeenCalledWith(expect.anything(), 'existing-id')
  })

  it('throws when resetting an existing slot user fails', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id', email: 'x@y.local' })
    mockGetAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'organizations') return buildChain(ORG_ROW)
        return buildChain({ data: null, error: null })
      },
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ error: { message: 'rate limited' } }),
        },
      },
    })

    await expect(
      createArmedTempPasswordStudent({ slot: 'a', password: 'pw123456!', expiresInMs: 1000 }),
    ).rejects.toThrow('createArmedTempPasswordStudent reset: rate limited')
  })

  it('creates a fresh auth user when no slot user exists yet', async () => {
    mockFindAuthUserByEmail.mockResolvedValue(undefined)
    const createUserMock = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'new-id' } }, error: null })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockGetAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'organizations') return buildChain(ORG_ROW)
        if (table === 'users') return { upsert: upsertMock }
        return buildChain({ data: null, error: null })
      },
      auth: { admin: { createUser: createUserMock } },
    })

    const result = await createArmedTempPasswordStudent({
      slot: 'fresh-slot',
      password: 'pw123456!',
      expiresInMs: 60_000,
    })

    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.stringContaining(E2E_TEMP_PASSWORD_EMAIL_PREFIX) }),
    )
    expect(result.userId).toBe('new-id')
  })

  it('throws when creating a fresh auth user fails', async () => {
    mockFindAuthUserByEmail.mockResolvedValue(undefined)
    mockGetAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'organizations') return buildChain(ORG_ROW)
        return buildChain({ data: null, error: null })
      },
      auth: {
        admin: {
          createUser: vi
            .fn()
            .mockResolvedValue({ data: null, error: { message: 'email already registered' } }),
        },
      },
    })

    await expect(
      createArmedTempPasswordStudent({ slot: 'a', password: 'pw123456!', expiresInMs: 1000 }),
    ).rejects.toThrow('createArmedTempPasswordStudent auth: email already registered')
  })

  it('throws when the public users row upsert fails', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id', email: 'x@y.local' })
    mockGetAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'organizations') return buildChain(ORG_ROW)
        if (table === 'users')
          return { upsert: vi.fn().mockResolvedValue({ error: { message: 'fk violation' } }) }
        return buildChain({ data: null, error: null })
      },
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
    })

    await expect(
      createArmedTempPasswordStudent({ slot: 'a', password: 'pw123456!', expiresInMs: 1000 }),
    ).rejects.toThrow('createArmedTempPasswordStudent public: fk violation')
  })

  it('arms an already-expired expiry when expiresInMs is negative', async () => {
    mockFindAuthUserByEmail.mockResolvedValue({ id: 'existing-id', email: 'x@y.local' })
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockGetAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'organizations') return buildChain(ORG_ROW)
        if (table === 'users') return { upsert: upsertMock }
        return buildChain({ data: null, error: null })
      },
      auth: { admin: { updateUserById: vi.fn().mockResolvedValue({ error: null }) } },
    })

    await createArmedTempPasswordStudent({
      slot: 'expired-slot',
      password: 'pw123456!',
      expiresInMs: -60_000,
    })

    const upsertArg = upsertMock.mock.calls[0]?.[0] as { temp_password_expires_at: string }
    expect(Date.parse(upsertArg.temp_password_expires_at)).toBeLessThan(Date.now())
  })
})

describe('readTempPasswordExpiresAt', () => {
  it('returns the stored expiry', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () =>
        buildChain({ data: { temp_password_expires_at: '2026-01-01T00:00:00.000Z' }, error: null }),
    })

    const result = await readTempPasswordExpiresAt('user-1')

    expect(result).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns null when no row is found', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: null }),
    })

    const result = await readTempPasswordExpiresAt('user-1')

    expect(result).toBeNull()
  })

  it('throws when the query errors', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => buildChain({ data: null, error: { message: 'connection reset' } }),
    })

    await expect(readTempPasswordExpiresAt('user-1')).rejects.toThrow(
      'readTempPasswordExpiresAt: connection reset',
    )
  })
})

describe('cleanupTempPasswordStudents', () => {
  it('does nothing when no throwaway students remain', async () => {
    const updateMock = vi.fn()
    mockGetAdminClient.mockReturnValue({
      from: () => ({
        select: () => buildChain({ data: [], error: null }),
        update: updateMock,
      }),
    })

    await cleanupTempPasswordStudents()

    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the select query fails', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => ({ select: () => buildChain({ data: null, error: { message: 'rls denied' } }) }),
    })

    await expect(cleanupTempPasswordStudents()).rejects.toThrow(
      'cleanupTempPasswordStudents: rls denied',
    )
  })

  it('soft-deletes every matching row', async () => {
    const softDeleteChain = buildChain({ data: [{ id: 'u1' }, { id: 'u2' }], error: null })
    const updateMock = vi.fn().mockReturnValue(softDeleteChain)
    mockGetAdminClient.mockReturnValue({
      from: () => ({
        select: () => buildChain({ data: [{ id: 'u1' }, { id: 'u2' }], error: null }),
        update: updateMock,
      }),
    })

    await cleanupTempPasswordStudents()

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
  })

  it('throws when the soft-delete update fails', async () => {
    mockGetAdminClient.mockReturnValue({
      from: () => ({
        select: () => buildChain({ data: [{ id: 'u1' }], error: null }),
        update: () => buildChain({ data: null, error: { message: 'permission denied' } }),
      }),
    })

    await expect(cleanupTempPasswordStudents()).rejects.toThrow(
      'cleanupTempPasswordStudents: permission denied',
    )
  })
})
