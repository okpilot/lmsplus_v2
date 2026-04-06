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

import { getFlaggedIds, toggleFlag } from './flag'

// ---- Helpers ---------------------------------------------------------------

/** Builds a fluent Supabase chain that resolves to the given return value. */
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

// ---- Fixtures --------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID_A = '00000000-0000-4000-a000-000000000011'
const QUESTION_ID_B = '00000000-0000-4000-a000-000000000022'

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
}

function setupAuthError() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
}

/**
 * Sets up mockFrom to return different chain values for each sequential call.
 * First call resolves to firstValue, second call resolves to secondValue.
 */
function setupSequentialFromCalls(firstValue: unknown, secondValue: unknown) {
  let callCount = 0
  mockFrom.mockImplementation(() => {
    callCount++
    return callCount === 1 ? buildChain(firstValue) : buildChain(secondValue)
  })
}

// ---- Tests -----------------------------------------------------------------

describe('toggleFlag', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---- auth ----------------------------------------------------------------

  it('returns not-authenticated error when no user is signed in', async () => {
    setupUnauthenticated()

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns not-authenticated error when auth returns an error', async () => {
    setupAuthError()

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  // ---- input validation ----------------------------------------------------

  it('returns invalid-input error when questionId is not a UUID', async () => {
    setupAuthenticatedUser()

    const result = await toggleFlag({ questionId: 'not-a-uuid' })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when input is null', async () => {
    setupAuthenticatedUser()

    const result = await toggleFlag(null)

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when questionId is missing', async () => {
    setupAuthenticatedUser()

    const result = await toggleFlag({})

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  // ---- lookup error ----------------------------------------------------------

  it('returns failure when the flag lookup errors', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'connection timeout' } }))

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Failed to toggle flag' })
  })

  // ---- flag-on path (question not currently flagged) -----------------------

  it('returns flagged: true when the question was not previously flagged', async () => {
    setupAuthenticatedUser()
    // First call: maybeSingle check returns null (not flagged)
    // Second call: upsert succeeds
    setupSequentialFromCalls({ data: null, error: null }, { error: null })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: true, flagged: true })
  })

  it('upserts into flagged_questions when the question is not flagged', async () => {
    setupAuthenticatedUser()
    setupSequentialFromCalls({ data: null, error: null }, { error: null })

    await toggleFlag({ questionId: QUESTION_ID_A })

    expect(mockFrom).toHaveBeenCalledWith('flagged_questions')
  })

  it('returns failure when the upsert errors during flag-on', async () => {
    setupAuthenticatedUser()
    setupSequentialFromCalls(
      { data: null, error: null },
      { error: { message: 'unique violation' } },
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to flag' })
  })

  // ---- flag-off path (question currently flagged) --------------------------

  it('returns flagged: false when the question was already flagged', async () => {
    setupAuthenticatedUser()
    // First call: maybeSingle check returns an existing row (is flagged)
    // Second call: soft-delete update succeeds
    setupSequentialFromCalls({ data: { student_id: USER_ID }, error: null }, { error: null })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: true, flagged: false })
  })

  it('soft-deletes the flag row (sets deleted_at) when unflagging', async () => {
    setupAuthenticatedUser()
    const methodsCalled: string[] = []

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // First call: the maybeSingle existence check — flag is present
        return buildChain({ data: { student_id: USER_ID }, error: null })
      }
      // Second call: the unflag update — spy on which methods are called
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
              if (typeof prop === 'string') methodsCalled.push(prop)
              return spyChain(returnValue)
            }
          },
        })
      }
      return spyChain({ error: null })
    })

    await toggleFlag({ questionId: QUESTION_ID_A })

    expect(methodsCalled).toContain('update')
    expect(methodsCalled).not.toContain('delete')
  })

  it('returns failure when the soft-delete errors during flag-off', async () => {
    setupAuthenticatedUser()
    setupSequentialFromCalls(
      { data: { student_id: USER_ID }, error: null },
      { error: { message: 'rls denied' } },
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to unflag' })
  })
})

describe('getFlaggedIds', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---- auth ----------------------------------------------------------------

  it('returns empty flaggedIds when no user is signed in', async () => {
    setupUnauthenticated()

    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A] })

    expect(result).toEqual({ success: true, flaggedIds: [] })
  })

  it('returns empty flaggedIds when auth returns an error', async () => {
    setupAuthError()

    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A] })

    expect(result).toEqual({ success: true, flaggedIds: [] })
  })

  // ---- input validation ----------------------------------------------------

  it('returns invalid-input error when questionIds contains a non-UUID', async () => {
    setupAuthenticatedUser()

    const result = await getFlaggedIds({ questionIds: ['not-a-uuid'] })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when questionIds is not an array', async () => {
    setupAuthenticatedUser()

    const result = await getFlaggedIds({ questionIds: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when input is null', async () => {
    setupAuthenticatedUser()

    const result = await getFlaggedIds(null)

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns invalid-input error when questionIds field is missing', async () => {
    setupAuthenticatedUser()

    const result = await getFlaggedIds({})

    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  // ---- happy path ----------------------------------------------------------

  it('returns the IDs of questions that are flagged', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [{ question_id: QUESTION_ID_A }], error: null }))

    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A, QUESTION_ID_B] })

    expect(result).toEqual({ success: true, flaggedIds: [QUESTION_ID_A] })
  })

  it('returns an empty array when none of the given questions are flagged', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A, QUESTION_ID_B] })

    expect(result).toEqual({ success: true, flaggedIds: [] })
  })

  it('returns all IDs when all given questions are flagged', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ question_id: QUESTION_ID_A }, { question_id: QUESTION_ID_B }],
        error: null,
      }),
    )

    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A, QUESTION_ID_B] })

    expect(result).toEqual({ success: true, flaggedIds: [QUESTION_ID_A, QUESTION_ID_B] })
  })

  it('accepts an empty questionIds array and returns no flagged IDs', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getFlaggedIds({ questionIds: [] })

    expect(result).toEqual({ success: true, flaggedIds: [] })
  })

  it('queries the active_flagged_questions view', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    await getFlaggedIds({ questionIds: [QUESTION_ID_A] })

    expect(mockFrom).toHaveBeenCalledWith('active_flagged_questions')
  })

  // ---- error handling ------------------------------------------------------

  it('returns a failure when the database query errors', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'query timeout' } }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A] })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to fetch flags' })
  })
})
