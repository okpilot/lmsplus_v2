import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
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
// Freeze "now" at 10:30 — SESSION_ROW started at 10:00 with a 3600s (1h) limit, so
// the default fixture is well within deadline. Tests that need an overdue row
// either bump time_limit_seconds down or override started_at to a past time.
const NOW_MS = Date.parse('2026-04-27T10:30:00.000Z')

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  mockRpc.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.useRealTimers()
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
      expiredSessionIds: [],
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

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: [],
      expiredSessionIds: [],
    })
  })

  it('returns an empty array when data is null', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: [],
      expiredSessionIds: [],
    })
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

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-empty'],
      expiredSessionIds: [],
    })
  })

  it('skips a row with non-array question_ids and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, id: 'session-bad', config: { question_ids: 'not-an-array' } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-bad'],
      expiredSessionIds: [],
    })
  })

  it('skips a row with non-string elements in question_ids and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [{ ...SESSION_ROW, id: 'session-nums', config: { question_ids: [1, 2, 3] } }],
        error: null,
      }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-nums'],
      expiredSessionIds: [],
    })
  })

  it('skips a row with null config and adds to orphanedSessionIds', async () => {
    mockFrom.mockReturnValue(
      buildChain({ data: [{ ...SESSION_ROW, id: 'session-null', config: null }], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-null'],
      expiredSessionIds: [],
    })
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
      expiredSessionIds: [],
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
      expiredSessionIds: [],
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
      expiredSessionIds: [],
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
      expiredSessionIds: [],
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

// ---- Layer 1 partitioning: expired (overdue) sessions --------------------

describe('getActiveExamSession — expired sessions (Layer 1)', () => {
  // SESSION_ROW started_at = 10:00, NOW = 10:30 → use a tiny limit to force overdue.
  const overdueRow = (id: string) => ({
    ...SESSION_ROW,
    id,
    started_at: '2026-04-27T10:00:00.000Z',
    time_limit_seconds: 60, // deadline 10:01, NOW = 10:30 → overdue
  })

  it('moves an overdue row to expiredSessionIds and invokes complete_overdue_exam_session', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [overdueRow('expired-1')], error: null }))

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions).toEqual([])
      expect(result.expiredSessionIds).toEqual(['expired-1'])
      expect(result.orphanedSessionIds).toEqual([])
    }
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'complete_overdue_exam_session', {
      p_session_id: 'expired-1',
    })
  })

  it('routes overdue row to orphanedSessionIds (not expiredSessionIds) when RPC errors', async () => {
    // If complete_overdue_exam_session fails, the session has no ended_at yet,
    // so the report page would redirect back to /app/quiz and the user would
    // see the same expired banner in a loop. Discard-only banner handles it.
    mockFrom.mockReturnValue(buildChain({ data: [overdueRow('expired-2')], error: null }))
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session is not overdue' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await getActiveExamSession()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.expiredSessionIds).toEqual([])
        expect(result.orphanedSessionIds).toEqual(['expired-2'])
      }
      expect(consoleSpy).toHaveBeenCalledWith(
        '[getActiveExamSession] Auto-complete failed:',
        'expired-2',
        'session is not overdue',
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('keeps an active (deadline-in-future) row in sessions; does not call RPC', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [SESSION_ROW], error: null }))

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0]?.sessionId).toBe('sess-001')
      expect(result.expiredSessionIds).toEqual([])
    }
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('partitions a mix of active + expired + orphaned rows into the correct buckets', async () => {
    const expiredRow = overdueRow('expired-mix')
    const orphanedRow = { ...SESSION_ROW, id: 'orphan-mix', config: { question_ids: [] } }
    mockFrom.mockReturnValue(
      buildChain({ data: [SESSION_ROW, expiredRow, orphanedRow], error: null }),
    )

    const result = await getActiveExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions.map((s) => s.sessionId)).toEqual(['sess-001'])
      expect(result.expiredSessionIds).toEqual(['expired-mix'])
      expect(result.orphanedSessionIds).toEqual(['orphan-mix'])
    }
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'complete_overdue_exam_session', {
      p_session_id: 'expired-mix',
    })
  })
})
