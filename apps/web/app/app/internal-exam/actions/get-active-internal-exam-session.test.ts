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

import { getActiveInternalExamSession } from './get-active-internal-exam-session'

// ---- Helpers -------------------------------------------------------------

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

const USER_ORG_ROW = { organization_id: 'org-1' }

/**
 * Wraps a session-table chain factory so that requests against the `users`
 * table return the standard org row, while everything else falls back to the
 * provided session chain. Mirrors how the production code calls
 * `from('users')` first to look up organization_id.
 */
function withUserChain(sessionChain: unknown) {
  return (table: string) =>
    table === 'users' ? buildChain({ data: USER_ORG_ROW, error: null }) : sessionChain
}

const SESSION_ROW = {
  id: 'sess-001',
  subject_id: 'subj-aaa',
  started_at: '2026-04-29T10:00:00.000Z',
  time_limit_seconds: 3600,
  config: { question_ids: ['q-1', 'q-2', 'q-3'], pass_mark: 75 },
  easa_subjects: { name: 'Air Law', short: 'ALW' },
}

// ---- Lifecycle ------------------------------------------------------------
// Freeze "now" at 10:30 — SESSION_ROW started at 10:00 with a 3600s limit, so
// the default fixture is well within deadline.
const NOW_MS = Date.parse('2026-04-29T10:30:00.000Z')

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

describe('getActiveInternalExamSession — unauthenticated', () => {
  it('returns error when auth error is present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } })
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [], error: null })))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns error when user is null without auth error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [], error: null })))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })
})

describe('getActiveInternalExamSession — happy path', () => {
  it('returns an array of active internal exam sessions with questionIds', async () => {
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [SESSION_ROW], error: null })))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [
        {
          sessionId: 'sess-001',
          subjectId: 'subj-aaa',
          subjectName: 'Air Law',
          subjectCode: 'ALW',
          startedAt: '2026-04-29T10:00:00.000Z',
          timeLimitSeconds: 3600,
          passMark: 75,
          questionIds: ['q-1', 'q-2', 'q-3'],
        },
      ],
      orphanedSessionIds: [],
      expiredSessionIds: [],
    })
  })

  it('returns an empty array when no active internal exam sessions exist', async () => {
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [], error: null })))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: [],
      expiredSessionIds: [],
    })
  })

  it('returns an empty array when data is null', async () => {
    mockFrom.mockImplementation(withUserChain(buildChain({ data: null, error: null })))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: [],
      expiredSessionIds: [],
    })
  })

  it('falls back to Unknown subject when easa_subjects is null', async () => {
    mockFrom.mockImplementation(
      withUserChain(buildChain({ data: [{ ...SESSION_ROW, easa_subjects: null }], error: null })),
    )

    const result = await getActiveInternalExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions[0]?.subjectName).toBe('Unknown subject')
      expect(result.sessions[0]?.subjectCode).toBe('')
    }
  })

  it('queries the quiz_sessions table', async () => {
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [], error: null })))

    await getActiveInternalExamSession()

    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
  })
})

describe('getActiveInternalExamSession — malformed config (row skipped)', () => {
  it('skips a row with empty question_ids and adds id to orphanedSessionIds', async () => {
    mockFrom.mockImplementation(
      withUserChain(
        buildChain({
          data: [{ ...SESSION_ROW, id: 'session-empty', config: { question_ids: [] } }],
          error: null,
        }),
      ),
    )

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-empty'],
      expiredSessionIds: [],
    })
  })

  it('skips a row with missing pass_mark and adds id to orphanedSessionIds', async () => {
    mockFrom.mockImplementation(
      withUserChain(
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
      ),
    )

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-no-pm'],
      expiredSessionIds: [],
    })
  })

  it('skips a row with null config and adds id to orphanedSessionIds', async () => {
    mockFrom.mockImplementation(
      withUserChain(
        buildChain({
          data: [{ ...SESSION_ROW, id: 'session-null', config: null }],
          error: null,
        }),
      ),
    )

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: true,
      sessions: [],
      orphanedSessionIds: ['session-null'],
      expiredSessionIds: [],
    })
  })
})

describe('getActiveInternalExamSession — DB error', () => {
  it('returns error when query fails', async () => {
    mockFrom.mockImplementation(
      withUserChain(buildChain({ data: null, error: { message: 'relation does not exist' } })),
    )

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: false,
      error: 'Failed to fetch active internal exam sessions.',
    })
  })
})

describe('getActiveInternalExamSession — expired sessions (Layer 1)', () => {
  const overdueRow = (id: string) => ({
    ...SESSION_ROW,
    id,
    started_at: '2026-04-29T10:00:00.000Z',
    time_limit_seconds: 60, // deadline 10:01, NOW = 10:30 → overdue
  })

  it('moves an overdue row to expiredSessionIds and invokes complete_overdue_exam_session', async () => {
    mockFrom.mockImplementation(
      withUserChain(buildChain({ data: [overdueRow('expired-1')], error: null })),
    )

    const result = await getActiveInternalExamSession()

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

  it('routes overdue row to orphanedSessionIds when RPC errors', async () => {
    mockFrom.mockImplementation(
      withUserChain(buildChain({ data: [overdueRow('expired-2')], error: null })),
    )
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session is not overdue' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await getActiveInternalExamSession()

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.expiredSessionIds).toEqual([])
        expect(result.orphanedSessionIds).toEqual(['expired-2'])
      }
      expect(consoleSpy).toHaveBeenCalledWith(
        '[getActiveInternalExamSession] Auto-complete failed:',
        'expired-2',
        'session is not overdue',
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('keeps an active (deadline-in-future) row in sessions; does not call RPC', async () => {
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [SESSION_ROW], error: null })))

    const result = await getActiveInternalExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions).toHaveLength(1)
      expect(result.sessions[0]?.sessionId).toBe('sess-001')
      expect(result.expiredSessionIds).toEqual([])
    }
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('filters by mode=internal_exam and the resolved organization_id', async () => {
    // Capture .eq calls so we can verify both the mode and org-scope filters
    // make it onto the quiz_sessions chain.
    const eqCalls: Array<[string, unknown]> = []
    const chain: Record<string, unknown> = {}
    // biome-ignore lint/suspicious/noThenProperty: supabase chain must be thenable to mock awaiting the query builder
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    chain.select = () => chain
    chain.eq = (col: string, val: unknown) => {
      eqCalls.push([col, val])
      return chain
    }
    chain.is = () => chain
    chain.order = () => chain
    mockFrom.mockImplementation((table: string) =>
      table === 'users' ? buildChain({ data: USER_ORG_ROW, error: null }) : chain,
    )

    await getActiveInternalExamSession()

    const modeFilter = eqCalls.find(([col]) => col === 'mode')
    expect(modeFilter?.[1]).toBe('internal_exam')
    const orgFilter = eqCalls.find(([col]) => col === 'organization_id')
    expect(orgFilter?.[1]).toBe(USER_ORG_ROW.organization_id)
  })
})
