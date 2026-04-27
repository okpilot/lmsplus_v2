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
  config: { question_ids: ['q-1', 'q-2', 'q-3'], pass_mark: 75 },
  easa_subjects: { name: 'Air Law', short: 'ALW' },
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
          subjectCode: 'ALW',
          startedAt: '2026-04-27T10:00:00.000Z',
          timeLimitSeconds: 3600,
          passMark: 75,
          questionIds: ['q-1', 'q-2', 'q-3'],
        },
      ],
      orphanedSessionIds: [],
    })
  })

  it('defaults subjectCode to empty string when easa_subjects.short is missing', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, easa_subjects: { name: 'Air Law' } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions[0]?.subjectCode).toBe('')
      expect(result.sessions[0]?.subjectName).toBe('Air Law')
    }
  })

  it('returns an empty array when no active exam sessions exist', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [], orphanedSessionIds: [] })
  })

  it('returns an empty array when data is null', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [], orphanedSessionIds: [] })
  })

  it('falls back to Unknown subject and empty subjectCode when easa_subjects is null', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...SESSION_ROW, easa_subjects: null }], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions[0]?.subjectName).toBe('Unknown subject')
      expect(result.sessions[0]?.subjectCode).toBe('')
    }
  })

  it('queries the quiz_sessions table', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))

    await getActiveExamSession()

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })
})

describe('getActiveExamSession — malformed config (row skipped)', () => {
  it('skips a row with empty question_ids array and returns its id in orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, id: 'session-empty', config: { question_ids: [] } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [], orphanedSessionIds: ['session-empty'] })
  })

  it('skips a row with non-array question_ids and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, id: 'session-bad', config: { question_ids: 'not-an-array' } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [], orphanedSessionIds: ['session-bad'] })
  })

  it('skips a row with non-string elements in question_ids and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, id: 'session-nums', config: { question_ids: [1, 2, 3] } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [], orphanedSessionIds: ['session-nums'] })
  })

  it('skips a row with null config and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...SESSION_ROW, id: 'session-null', config: null }], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({ success: true, sessions: [], orphanedSessionIds: ['session-null'] })
  })

  it('skips a row with missing pass_mark and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            ...SESSION_ROW,
            id: 'session-no-pm',
            config: { question_ids: ['q-1', 'q-2'] },
          },
        ],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-no-pm'],
    })
  })

  it('skips a row with non-numeric pass_mark and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            ...SESSION_ROW,
            id: 'session-bad-pm',
            config: { question_ids: ['q-1'], pass_mark: '75' },
          },
        ],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-bad-pm'],
    })
  })

  it('skips a row with out-of-range pass_mark and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            ...SESSION_ROW,
            id: 'session-pm-150',
            config: { question_ids: ['q-1'], pass_mark: 150 },
          },
        ],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-pm-150'],
    })
  })

  it('skips a row with pass_mark = 0 (DB constraint requires > 0)', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            ...SESSION_ROW,
            id: 'session-pm-zero',
            config: { question_ids: ['q-1'], pass_mark: 0 },
          },
        ],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-pm-zero'],
    })
  })

  it('returns valid rows alongside skipped ones; skipped row id in orphanedSessionIds', async () => {
    const badRow = { ...SESSION_ROW, id: 'sess-bad', config: { question_ids: [] } }
    mockFrom.mockReturnValue(buildChain({ data: [SESSION_ROW, badRow], error: null }))

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0]?.sessionId).toBe('sess-001')
      expect(result.orphanedSessionIds).toEqual(['sess-bad'])
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
