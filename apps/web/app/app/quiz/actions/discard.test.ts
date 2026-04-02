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

import { discardQuiz } from './discard'

// ---- Helpers ---------------------------------------------------------------

/** Builds a fluent chain that resolves to the given return value. */
function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
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

// ---- Tests -----------------------------------------------------------------

describe('discardQuiz', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  // ---- auth ----------------------------------------------------------------

  it('returns not-authenticated error when no user is signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  // ---- input validation ----------------------------------------------------

  it('returns invalid-input error when sessionId is not a UUID', async () => {
    const result = await discardQuiz({ sessionId: 'not-a-uuid' })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when input is missing entirely', async () => {
    const result = await discardQuiz(null)
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when draftId is present but not a UUID', async () => {
    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
      draftId: 'not-a-uuid',
    })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  // ---- session soft-delete -------------------------------------------------

  it('soft-deletes the session and returns success when no draftId is provided', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null }),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })

  it('returns failure when session not found or not owned (zero rows affected)', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'Session not found or already discarded' })
  })

  it('returns failure when the session soft-delete query errors', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ error: { message: 'constraint violation' } })
      return buildChain({ error: null })
    })

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'Failed to discard quiz' })
  })

  // ---- draft cleanup -------------------------------------------------------

  it('deletes the draft and returns success when draftId is provided', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null })
      if (table === 'quiz_drafts') return buildChain({ error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
      draftId: '00000000-0000-4000-a000-000000000002',
    })

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('quiz_drafts')
  })

  it('still returns success when draft deletion fails (non-fatal)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null })
      if (table === 'quiz_drafts') return buildChain({ error: { message: 'draft not found' } })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
      draftId: '00000000-0000-4000-a000-000000000002',
    })

    // Session was discarded; draft error is non-fatal
    expect(result).toEqual({ success: true })
  })

  it('does not query quiz_drafts when no draftId is provided', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null }),
    )

    await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    const tablesCalled = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(tablesCalled).not.toContain('quiz_drafts')
  })

  it('uses hard DELETE (not soft-delete) for draft cleanup', async () => {
    // Track which method is called on the quiz_drafts chain
    const draftChainMethods: string[] = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null })
      if (table === 'quiz_drafts') {
        // Build a spy chain that records method names before forwarding
        const spyChain = (returnValue: unknown): unknown => {
          const awaitable = {
            // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(returnValue).then(resolve, reject),
          }
          return new Proxy(awaitable as Record<string, unknown>, {
            get(target, prop) {
              if (prop === 'then') return target.then
              return (..._args: unknown[]) => {
                if (typeof prop === 'string') draftChainMethods.push(prop)
                return spyChain(returnValue)
              }
            },
          })
        }
        return spyChain({ error: null })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
      draftId: '00000000-0000-4000-a000-000000000002',
    })

    expect(draftChainMethods).toContain('delete')
    expect(draftChainMethods).not.toContain('update')
  })

  // ---- unexpected errors ---------------------------------------------------

  it('returns a generic error when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong. Please try again.',
    })
  })
})
