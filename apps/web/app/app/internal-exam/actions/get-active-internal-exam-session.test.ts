import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockVerifySessionUser, mockRpc, mockClient } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockRpc: vi.fn(),
  mockClient: { from: vi.fn() },
}))
const mockFrom = mockClient.from

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({ verifySessionUser: mockVerifySessionUser }))

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
  mockVerifySessionUser.mockResolvedValue({ id: 'user-1', email: null })
  mockRpc.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

// ---- Tests ----------------------------------------------------------------

describe('getActiveInternalExamSession — unauthenticated', () => {
  it('returns error when no user is in the session', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    mockFrom.mockImplementation(withUserChain(buildChain({ data: [], error: null })))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('returns not-authenticated without logging when the caller has no active users row', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('returns a generic failure and logs when the users lookup errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))

    const result = await getActiveInternalExamSession()

    expect(result).toEqual({
      success: false,
      error: 'Failed to fetch active internal exam sessions.',
    })
    expect(errorSpy).toHaveBeenCalledWith(
      '[getActiveInternalExamSession] User lookup error:',
      'boom',
    )
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

async function expectQuarantined(row: Record<string, unknown>) {
  mockFrom.mockImplementation(withUserChain(buildChain({ data: [row], error: null })))
  expect(await getActiveInternalExamSession()).toEqual({
    success: true,
    sessions: [],
    orphanedSessionIds: [row.id],
    expiredSessionIds: [],
  })
}

describe('getActiveInternalExamSession — malformed time_limit_seconds (row quarantined)', () => {
  it.each([
    ['null', null],
    ['0', 0],
    ['a fraction', 3600.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('quarantines a row with time_limit_seconds=%s into orphanedSessionIds', async (_, value) => {
    await expectQuarantined({ ...SESSION_ROW, id: 'sess-bad-tl', time_limit_seconds: value })
  })
})

describe('getActiveInternalExamSession — malformed started_at (row quarantined)', () => {
  it.each([
    ['a number', 1_700_000_000_000],
    ['an unparseable string', 'not-a-date'],
    ['null', null],
  ])('quarantines a row with started_at=%s into orphanedSessionIds', async (_, value) => {
    await expectQuarantined({ ...SESSION_ROW, id: 'sess-bad-sa', started_at: value })
  })

  it('accepts a valid ISO started_at string and places the row in sessions', async () => {
    mockFrom.mockImplementation(
      withUserChain(
        buildChain({
          data: [{ ...SESSION_ROW, id: 'sess-valid-sa', started_at: '2026-04-29T10:00:00.000Z' }],
          error: null,
        }),
      ),
    )

    const result = await getActiveInternalExamSession()

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.sessions[0]?.sessionId).toBe('sess-valid-sa')
      expect(result.orphanedSessionIds).toEqual([])
    }
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
