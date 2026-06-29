import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ---- Subject under test ----------------------------------------------------

import { endDiscovery } from './end-discovery'

// ---- Helpers ---------------------------------------------------------------

type ChainCall = { method: string; args: unknown[] }

/**
 * Builds a fluent chain that resolves to the given return value. When `calls` is
 * provided, every chained method invocation is recorded so a test can assert which
 * filters (e.g. `.eq('id', …)`) were applied.
 */
function buildChain(returnValue: unknown, calls?: ChainCall[]) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls?.push({ method: String(prop), args })
        return buildChain(returnValue, calls)
      }
    },
  })
}

// ---- Tests -----------------------------------------------------------------

describe('endDiscovery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('returns not-authenticated error when no user is signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await endDiscovery()
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns invalid-input error when a non-object payload is passed', async () => {
    const result = await endDiscovery('unexpected')
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('soft-deletes the active discovery session and returns success', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [{ id: 'sess-1' }], error: null }))
    const result = await endDiscovery()
    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })

  it('scopes the soft-delete to the given session id when one is provided', async () => {
    const sessionId = '00000000-0000-4000-a000-0000000000ff'
    const calls: ChainCall[] = []
    mockFrom.mockReturnValue(buildChain({ data: [{ id: sessionId }], error: null }, calls))
    const result = await endDiscovery({ sessionId })
    expect(result).toEqual({ success: true })
    expect(calls).toContainEqual({ method: 'eq', args: ['id', sessionId] })
  })

  it('does not scope by id for the blanket Exit teardown', async () => {
    const calls: ChainCall[] = []
    mockFrom.mockReturnValue(buildChain({ data: [{ id: 'sess-1' }], error: null }, calls))
    await endDiscovery()
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'id')).toBe(false)
  })

  it('returns invalid-input error when sessionId is not a valid UUID', async () => {
    const result = await endDiscovery({ sessionId: 'not-a-uuid' })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns success when no active discovery session exists (zero-row no-op)', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))
    const result = await endDiscovery({})
    expect(result).toEqual({ success: true })
  })

  it('returns failure when the soft-delete query errors', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { message: 'constraint violation', code: 'XX000' } }),
    )
    const result = await endDiscovery()
    expect(result).toEqual({ success: false, error: 'Failed to exit discovery' })
  })

  it('returns a generic error when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const result = await endDiscovery()
    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })
})
