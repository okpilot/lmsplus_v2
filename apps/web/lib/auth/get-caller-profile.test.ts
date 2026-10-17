import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFrom = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() => vi.fn())
const cacheStore = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

// The client build of React's `cache` is a passthrough, so substitute a memo keyed on
// the function and its arguments, as the server build does within one request.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const fnIds = new Map<unknown, number>()
  return {
    ...actual,
    cache:
      (fn: (...args: never[]) => unknown) =>
      (...args: never[]) => {
        if (!fnIds.has(fn)) fnIds.set(fn, fnIds.size)
        const key = `${fnIds.get(fn)}:${JSON.stringify(args)}`
        if (!cacheStore.has(key)) cacheStore.set(key, fn(...args))
        return cacheStore.get(key)
      },
  }
})

import { getCallerProfile } from './get-caller-profile'

function buildChain(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const is = vi.fn().mockReturnValue({ maybeSingle })
  const eq = vi.fn().mockReturnValue({ is })
  const select = vi.fn().mockReturnValue({ eq })
  return { select, eq, is, maybeSingle }
}

describe('getCallerProfile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    cacheStore.clear()
    mockCreateServerSupabaseClient.mockResolvedValue({ from: mockFrom })
  })

  it('reads the live users row for the given id', async () => {
    const chain = buildChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    await getCallerProfile('user-1')

    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(chain.select).toHaveBeenCalledWith('full_name, email, role, organization_id, created_at')
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-1')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('returns the profile row when the read succeeds', async () => {
    const row = {
      full_name: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      organization_id: 'o1',
      created_at: '2026-01-01T00:00:00Z',
    }
    mockFrom.mockReturnValue(buildChain({ data: row, error: null }))

    expect(await getCallerProfile('user-1')).toEqual({ data: row, error: null })
  })

  it('returns the error when the read fails', async () => {
    const error = { message: 'boom' }
    mockFrom.mockReturnValue(buildChain({ data: null, error }))

    expect(await getCallerProfile('user-1')).toEqual({ data: null, error })
  })

  it('reads once when asked twice for the same id in one render', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    await getCallerProfile('user-1')
    await getCallerProfile('user-1')

    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('reads separately for two different ids', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    await getCallerProfile('user-1')
    await getCallerProfile('user-2')

    expect(mockFrom).toHaveBeenCalledTimes(2)
  })
})
