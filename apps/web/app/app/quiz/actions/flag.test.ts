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

/**
 * Sets up mockFrom to dispatch by table name so tests can target specific
 * tables independently. The quiz_sessions key controls the active-exam guard;
 * active_flagged_questions controls the existence check; flagged_questions
 * controls the upsert/update mutation.
 */
function setupFromByTable(config: {
  quiz_sessions?: unknown
  active_flagged_questions?: unknown
  flagged_questions?: unknown
}) {
  mockFrom.mockImplementation((table: string) => {
    switch (table) {
      case 'quiz_sessions':
        return buildChain(config.quiz_sessions ?? { data: null, error: null })
      case 'active_flagged_questions':
        return buildChain(config.active_flagged_questions ?? { data: null, error: null })
      case 'flagged_questions':
        return buildChain(config.flagged_questions ?? { error: null })
      default:
        // Fail fast: an unexpected table means toggleFlag queried the wrong
        // table — surface it instead of returning a misleading empty result.
        throw new Error(`Unexpected table in setupFromByTable: ${table}`)
    }
  })
}

// ---- Fixtures --------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID_A = '00000000-0000-4000-a000-000000000011'
const QUESTION_ID_B = '00000000-0000-4000-a000-000000000022'

function setupAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID, email: null })
}

// ---- Tests -----------------------------------------------------------------

describe('toggleFlag', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---- auth ----------------------------------------------------------------

  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await toggleFlag({ questionId: QUESTION_ID_A })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
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

  // ---- internal_exam guard -------------------------------------------------

  it('rejects flagging during an active internal exam', async () => {
    setupAuthenticatedUser()
    const updateSpy = vi.fn()
    const upsertSpy = vi.fn()
    // Active internal_exam session present; verify the flag mutation (update/upsert) is never called.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: { id: '00000000-0000-4000-a000-000000000099' }, error: null })
      if (table === 'flagged_questions') {
        const chain = buildChain({ error: null })
        return new Proxy(chain as Record<string, unknown>, {
          get(_target, prop) {
            if (prop === 'update') return updateSpy
            if (prop === 'upsert') return upsertSpy
            if (prop === 'then')
              return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                Promise.resolve({ error: null }).then(resolve, reject)
            return (..._args: unknown[]) => chain
          },
        })
      }
      return buildChain({ data: null, error: null })
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'cannot_flag_internal_exam' })
    expect(updateSpy).not.toHaveBeenCalled()
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('returns a generic failure when active exam status cannot be checked', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: { message: 'db timeout' } },
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Failed to toggle flag' })
  })

  it('starts the exam check and the flag lookup before either finishes', async () => {
    setupAuthenticatedUser()
    let resolveExamCheck: (v: unknown) => void = () => {}
    const examCheck = new Promise((resolve) => {
      resolveExamCheck = resolve
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain(examCheck)
      if (table === 'active_flagged_questions') return buildChain({ data: null, error: null })
      return buildChain({ error: null })
    })

    const pending = toggleFlag({ questionId: QUESTION_ID_A })
    await vi.waitFor(() => {
      const tables = mockFrom.mock.calls.map(([table]) => table)
      expect(tables).toContain('quiz_sessions')
      expect(tables).toContain('active_flagged_questions')
    })
    resolveExamCheck({ data: null, error: null })

    await expect(pending).resolves.toEqual({ success: true, flagged: true })
  })

  it('reports the internal-exam rejection even when the flag lookup also fails', async () => {
    setupAuthenticatedUser()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setupFromByTable({
      quiz_sessions: { data: { id: '00000000-0000-4000-a000-000000000099' }, error: null },
      active_flagged_questions: { data: null, error: { message: 'connection timeout' } },
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'cannot_flag_internal_exam' })
    expect(errorSpy).toHaveBeenCalledWith(
      '[toggleFlag] Rejected flag during active internal_exam for user',
      USER_ID,
    )
  })

  it('does not write when the exam check fails but the flag lookup succeeds', async () => {
    setupAuthenticatedUser()
    const upsertSpy = vi.fn()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: null, error: { message: 'db timeout' } })
      if (table === 'active_flagged_questions') return buildChain({ data: null, error: null })
      return { upsert: upsertSpy, update: upsertSpy }
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Failed to toggle flag' })
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  // ---- lookup error ----------------------------------------------------------

  it('returns a generic failure when existing flag status cannot be checked', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: null },
      active_flagged_questions: { data: null, error: { message: 'connection timeout' } },
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: false, error: 'Failed to toggle flag' })
  })

  // ---- flag-on path (question not currently flagged) -----------------------

  it('returns flagged: true when the question was not previously flagged', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: null },
      active_flagged_questions: { data: null, error: null },
      flagged_questions: { error: null },
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: true, flagged: true })
  })

  it('upserts into flagged_questions when the question is not flagged', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: null },
      active_flagged_questions: { data: null, error: null },
      flagged_questions: { error: null },
    })

    await toggleFlag({ questionId: QUESTION_ID_A })

    expect(mockFrom).toHaveBeenCalledWith('flagged_questions')
  })

  it('returns failure when the upsert errors during flag-on', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: null },
      active_flagged_questions: { data: null, error: null },
      flagged_questions: { error: { message: 'unique violation' } },
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Failed to flag' })
  })

  // ---- flag-off path (question currently flagged) --------------------------

  it('returns flagged: false when the question was already flagged', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: null },
      active_flagged_questions: { data: { student_id: USER_ID }, error: null },
      flagged_questions: { data: [{ student_id: USER_ID }], error: null },
    })

    const result = await toggleFlag({ questionId: QUESTION_ID_A })

    expect(result).toEqual({ success: true, flagged: false })
  })

  it('soft-deletes the flag row (sets deleted_at) when unflagging', async () => {
    setupAuthenticatedUser()
    const methodsCalled: string[] = []

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

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: null, error: null })
      if (table === 'active_flagged_questions')
        return buildChain({ data: { student_id: USER_ID }, error: null })
      // flagged_questions: spy chain tracks which methods are called
      return spyChain({ error: null })
    })

    await toggleFlag({ questionId: QUESTION_ID_A })

    expect(methodsCalled).toContain('update')
    expect(methodsCalled).not.toContain('delete')
  })

  it('returns failure when the soft-delete errors during flag-off', async () => {
    setupAuthenticatedUser()
    setupFromByTable({
      quiz_sessions: { data: null, error: null },
      active_flagged_questions: { data: { student_id: USER_ID }, error: null },
      flagged_questions: { data: null, error: { message: 'rls denied' } },
    })
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

  it('returns an empty result when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await getFlaggedIds({ questionIds: [QUESTION_ID_A] })
    expect(result).toEqual({ success: true, flaggedIds: [] })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
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
