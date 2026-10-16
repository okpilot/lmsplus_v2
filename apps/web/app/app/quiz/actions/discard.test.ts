import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockVerifySessionUser, mockFrom } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockFrom: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({ from: mockFrom }))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
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
    mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })
  })

  // ---- auth ----------------------------------------------------------------

  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await discardQuiz({ sessionId: '00000000-0000-4000-a000-000000000001' })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
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

  // ---- session soft-delete -------------------------------------------------

  /**
   * Helper: build a quiz_sessions chain that:
   *   - returns `selectResult` when the chain ends with `.maybeSingle()` (pre-fetch)
   *   - returns `updateResult` otherwise (UPDATE ... .select('id'))
   */
  function quizSessionsDualChain(selectResult: unknown, updateResult: unknown) {
    function makeChain(returnValue: unknown): unknown {
      const awaitable = {
        // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(returnValue).then(resolve, reject),
      }
      return new Proxy(awaitable as Record<string, unknown>, {
        get(target, prop) {
          if (prop === 'then') return target.then
          if (prop === 'maybeSingle') return () => makeChain(selectResult)
          return (..._args: unknown[]) => makeChain(returnValue)
        },
      })
    }
    return makeChain(updateResult)
  }

  it('soft-deletes the session and returns success', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain(
        { data: { id: '00000000-0000-4000-a000-000000000001', mode: 'quick_quiz' }, error: null },
        { data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null },
      ),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: true })
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })

  it('soft-deletes a mock_exam (Practice Exam) session — regression guard', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain(
        { data: { id: '00000000-0000-4000-a000-000000000001', mode: 'mock_exam' }, error: null },
        { data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null },
      ),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: true })
  })

  it('rejects discard for internal_exam sessions (server-side guard)', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain(
        {
          data: { id: '00000000-0000-4000-a000-000000000001', mode: 'internal_exam' },
          error: null,
        },
        // Should never be reached — UPDATE must not run.
        { data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null },
      ),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'cannot_discard_internal_exam' })
  })

  it('rejects discarding a vfr_rt_exam session', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain(
        {
          data: { id: '00000000-0000-4000-a000-000000000001', mode: 'vfr_rt_exam' },
          error: null,
        },
        // Should never be reached — UPDATE must not run.
        { data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null },
      ),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'cannot_discard_vfr_rt_exam' })
  })

  function mockZeroRowUpdate(usersResult: unknown) {
    mockFrom.mockImplementation((table: string) =>
      table === 'users'
        ? buildChain(usersResult)
        : quizSessionsDualChain(
            {
              data: { id: '00000000-0000-4000-a000-000000000001', mode: 'quick_quiz' },
              error: null,
            },
            { data: [], error: null },
          ),
    )
  }

  const ZERO_ROW_INPUT = { sessionId: '00000000-0000-4000-a000-000000000001' }

  it('returns session-not-found when the update changes no rows and the caller is active', async () => {
    mockZeroRowUpdate({ data: { id: 'user-1' }, error: null })
    const result = await discardQuiz(ZERO_ROW_INPUT)
    expect(result).toEqual({ success: false, error: 'Session not found or already discarded' })
  })

  it('returns the account-inactive message when the update changes no rows and the caller is deactivated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockZeroRowUpdate({ data: null, error: null })
    const result = await discardQuiz(ZERO_ROW_INPUT)
    expect(result).toEqual({ success: false, error: 'Your account is no longer active.' })
  })

  it('returns a generic discard failure, not the inactive message, when the caller lookup errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockZeroRowUpdate({ data: null, error: { message: 'boom', code: 'XX000' } })
    const result = await discardQuiz(ZERO_ROW_INPUT)
    expect(result).toEqual({ success: false, error: 'Failed to discard quiz' })
  })

  it('returns failure when the session is not found by the pre-fetch', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain({ data: null, error: null }, { data: [], error: null }),
    )
    const result = await discardQuiz(ZERO_ROW_INPUT)
    expect(result).toEqual({ success: false, error: 'Session not found or already discarded' })
  })

  it('returns failure when the session soft-delete query errors', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return quizSessionsDualChain(
          {
            data: { id: '00000000-0000-4000-a000-000000000001', mode: 'quick_quiz' },
            error: null,
          },
          { error: { message: 'constraint violation' } },
        )
      return buildChain({ error: null })
    })

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'Failed to discard quiz' })
  })

  it('returns failure when the session pre-fetch query errors', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain(
        { data: null, error: { message: 'connection lost', code: 'XX000' } },
        { data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null },
      ),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({ success: false, error: 'Failed to discard quiz' })
  })

  // ---- legacy input ----------------------------------------------------------

  it('ignores a draftId field and never touches quiz_drafts', async () => {
    mockFrom.mockReturnValue(
      quizSessionsDualChain(
        { data: { id: '00000000-0000-4000-a000-000000000001', mode: 'quick_quiz' }, error: null },
        { data: [{ id: '00000000-0000-4000-a000-000000000001' }], error: null },
      ),
    )

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
      draftId: '00000000-0000-4000-a000-000000000002',
    })

    expect(result).toEqual({ success: true })
    const tablesCalled = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(tablesCalled).not.toContain('quiz_drafts')
  })

  // ---- unexpected errors ---------------------------------------------------

  it('returns a generic error when an unexpected exception is thrown', async () => {
    mockVerifySessionUser.mockRejectedValue(new Error('network failure'))

    const result = await discardQuiz({
      sessionId: '00000000-0000-4000-a000-000000000001',
    })

    expect(result).toEqual({
      success: false,
      error: 'Something went wrong. Please try again.',
    })
  })
})
