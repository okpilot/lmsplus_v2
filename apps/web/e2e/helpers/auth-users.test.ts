import { describe, expect, it, vi } from 'vitest'
import { findAuthUserByEmail } from './auth-users'

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
})
