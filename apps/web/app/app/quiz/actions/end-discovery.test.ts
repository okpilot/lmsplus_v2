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

/**
 * Builds a fluent chain that resolves to the given return value. Every chained
 * method invocation returns the same chain, so the awaited result is `returnValue`.
 */
function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return () => buildChain(returnValue)
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
