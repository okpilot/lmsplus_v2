import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

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

// ---- Subject under test ---------------------------------------------------

import { getActiveExamSession } from './get-active-exam-session'

// ---- Helpers -------------------------------------------------------------

/** Builds a fluent Supabase chain that resolves to the given result. */
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

const SESSION_ROW = {
  id: 'sess-001',
  subject_id: 'subj-aaa',
  started_at: '2026-04-27T10:00:00.000Z',
  time_limit_seconds: 3600,
  config: { question_ids: ['q-1', 'q-2', 'q-3'] },
  easa_subjects: { name: 'Air Law' },
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
})

// ---- Tests ----------------------------------------------------------------

describe('getActiveExamSession — unauthenticated', () => {
  it('returns error when auth error is present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns error when user is null without auth error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })
})

describe('getActiveExamSession — happy path', () => {
  it('returns an array of active exam sessions with questionIds', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [SESSION_ROW], error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [
        {
          sessionId: 'sess-001',
          subjectId: 'subj-aaa',
          subjectName: 'Air Law',
          startedAt: '2026-04-27T10:00:00.000Z',
          timeLimitSeconds: 3600,
          questionIds: ['q-1', 'q-2', 'q-3'],
        },
      ],
    })
  })

  it('returns an empty array when no active exam sessions exist', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [] })
  })

  it('returns an empty array when data is null', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [] })
  })

  it('falls back to Unknown subject when easa_subjects is null', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...SESSION_ROW, easa_subjects: null }], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions[0]?.subjectName).toBe('Unknown subject')
    }
  })

  it('queries the quiz_sessions table', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    await getActiveExamSession()

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })
})

describe('getActiveExamSession — malformed config (row skipped)', () => {
  it('skips a row with empty question_ids array', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...SESSION_ROW, config: { question_ids: [] } }], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [] })
  })

  it('skips a row with non-array question_ids', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, config: { question_ids: 'not-an-array' } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [] })
  })

  it('skips a row with non-string elements in question_ids', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...SESSION_ROW, config: { question_ids: [1, 2, 3] } }], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [] })
  })

  it('skips a row with null config', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [{ ...SESSION_ROW, config: null }], error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [] })
  })

  it('returns valid rows alongside skipped ones', async () => {
    const badRow = { ...SESSION_ROW, id: 'sess-bad', config: { question_ids: [] } }
    mockFrom.mockReturnValue(buildChain({ data: [SESSION_ROW, badRow], error: null }))

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0]?.sessionId).toBe('sess-001')
    }
  })
})

describe('getActiveExamSession — DB error', () => {
  it('returns error when query fails', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: null, error: { message: 'relation does not exist' } }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: false, error: 'Failed to fetch active exam sessions.' })
  })
})
