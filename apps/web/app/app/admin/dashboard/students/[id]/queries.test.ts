import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockFrom,
  },
}))

// ---- Subject under test -----------------------------------------------------

import { getStudentDetail, getStudentSessions } from './queries'

// ---- Helpers ----------------------------------------------------------------

const DEFAULT_ORG_ID = 'org-1'
const STUDENT_ID = 'student-1'

function makeAdminContext(overrides: Partial<{ organizationId: string }> = {}) {
  return {
    userId: 'admin-1',
    organizationId: DEFAULT_ORG_ID,
    ...overrides,
  }
}

/**
 * Builds a chainable mock for getStudentDetail's query chain.
 * Chain: .select().eq().eq().eq().maybeSingle() → { data, error }
 */
function makeDetailChain(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

type SessionCountChain = {
  [key: string]: unknown
  range: ReturnType<typeof vi.fn>
}

/**
 * Builds a chainable mock for getStudentSessions's query chain.
 * Chain: .select().eq().eq().is().not().gte().order().range() → { data, error, count }
 * `.gte()` is optional (only called when a time range is active).
 */
function makeSessionChain(
  data: unknown[],
  count: number | null = null,
  error: { message: string } | null = null,
): SessionCountChain {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'not', 'gte', 'order']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  chain.range = vi.fn().mockResolvedValue({ data, error, count })
  return chain as SessionCountChain
}

type UserDetailRow = {
  id: string
  full_name: string | null
  email: string
  role: string
  last_active_at: string | null
  created_at: string
  deleted_at: string | null
}

function makeUserDetailRow(overrides: Partial<UserDetailRow> = {}): UserDetailRow {
  return {
    id: STUDENT_ID,
    full_name: 'Alice',
    email: 'alice@example.com',
    role: 'student',
    last_active_at: null,
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

type SessionRow = {
  id: string
  mode: string
  score_percentage: number | null
  total_questions: number
  correct_count: number
  started_at: string
  ended_at: string | null
  easa_subjects: { name: string } | null
  easa_topics: { name: string } | null
  // Test-only: NOT a quiz_sessions column. Drives how many quiz_session_answers rows
  // makeAnswerRows synthesizes for this session id in mockSessionsQuery — kept on the
  // fixture so a test can vary it in one place instead of threading a bare number through.
  answeredItems: number
}

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    mode: 'exam',
    score_percentage: 75,
    total_questions: 20,
    correct_count: 15,
    started_at: '2026-04-01T10:00:00Z',
    ended_at: '2026-04-01T10:45:00Z',
    easa_subjects: { name: 'Meteorology' },
    easa_topics: { name: 'Pressure' },
    // Deliberately distinct from both correct_count (15) and total_questions (20) so a
    // regression that derives answeredItems from either can't pass by coincidence.
    answeredItems: 12,
    ...overrides,
  }
}

/**
 * Builds a chainable mock for ONE `.from('quiz_session_answers')` call inside
 * fetchAnsweredItemCounts. fetchAllRows issues that call TWICE per invocation — once
 * (synchronously, before either is awaited) for the `{count:'exact', head:true}` count
 * read, and again — only if that count succeeds and is non-zero — for the `.range()`
 * page read. `mockSessionsQuery` below constructs a FRESH chain instance per `.from()`
 * call, so each phase resolves its own fixed `{ data, error, count }` result instead of
 * sharing one: a count-phase error and a page-phase error are independently reachable.
 */
function makeAnswerCountsChain(result: {
  data: { session_id: string }[] | null
  error: { message: string } | null
  count: number | null
}) {
  const chain: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  }
  for (const method of ['select', 'in', 'order', 'range']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  return chain
}

function makeAnswerRows(sessionId: string, count: number): { session_id: string }[] {
  return Array.from({ length: count }, () => ({ session_id: sessionId }))
}

/**
 * Dispatches adminClient.from() by table name: 'quiz_sessions' returns the caller's
 * session-page chain; 'quiz_session_answers' returns a chain for fetchAnsweredItemCounts's
 * item-count lookup, which calls `.from('quiz_session_answers')` TWICE — first for its
 * count read, then (only once that count is non-zero) for its page read. The two calls
 * are dispatched to independent fixtures: the FIRST carries `answerError` (a count-phase
 * failure), the SECOND carries `answerPageError` (a page-phase failure reachable only
 * once the count itself succeeded).
 */
function mockSessionsQuery(
  sessionChain: SessionCountChain,
  opts: {
    answerRows?: { session_id: string }[]
    answerError?: { message: string } | null
    answerPageError?: { message: string } | null
  } = {},
) {
  const { answerRows = [], answerError = null, answerPageError = null } = opts
  let answerCallIndex = 0
  mockFrom.mockImplementation((table: string) => {
    if (table === 'quiz_sessions') return sessionChain
    if (table === 'quiz_session_answers') {
      const callIndex = answerCallIndex++
      if (callIndex === 0) {
        return answerError
          ? makeAnswerCountsChain({ data: null, error: answerError, count: null })
          : makeAnswerCountsChain({ data: null, error: null, count: answerRows.length })
      }
      return answerPageError
        ? makeAnswerCountsChain({ data: null, error: answerPageError, count: null })
        : makeAnswerCountsChain({ data: answerRows, error: null, count: answerRows.length })
    }
    throw new Error(`Unexpected table queried in test: ${table}`)
  })
}

// ---- getStudentDetail -------------------------------------------------------

describe('getStudentDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns mapped student detail when student is found', async () => {
    const row = makeUserDetailRow()
    const chain = makeDetailChain(row)
    mockFrom.mockReturnValue(chain)

    const result = await getStudentDetail(STUDENT_ID)

    expect(result).toEqual({
      id: STUDENT_ID,
      fullName: 'Alice',
      email: 'alice@example.com',
      role: 'student',
      lastActiveAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      deletedAt: null,
    })
  })

  it('scopes query by student id, organization, and role', async () => {
    const chain = makeDetailChain(makeUserDetailRow())
    mockFrom.mockReturnValue(chain)

    await getStudentDetail(STUDENT_ID)

    expect(mockFrom).toHaveBeenCalledWith('users')
    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls).toContainEqual(['id', STUDENT_ID])
    expect(eqCalls).toContainEqual(['organization_id', DEFAULT_ORG_ID])
    expect(eqCalls).toContainEqual(['role', 'student'])
  })

  it('returns null when no student matches the id and org', async () => {
    mockFrom.mockReturnValue(makeDetailChain(null))

    const result = await getStudentDetail(STUDENT_ID)

    expect(result).toBeNull()
  })

  it('maps null full_name to fullName null', async () => {
    mockFrom.mockReturnValue(makeDetailChain(makeUserDetailRow({ full_name: null })))

    const result = await getStudentDetail(STUDENT_ID)

    expect(result?.fullName).toBeNull()
  })

  it('returns inactive student with deletedAt populated', async () => {
    const row = makeUserDetailRow({ deleted_at: '2026-03-15T12:00:00Z' })
    mockFrom.mockReturnValue(makeDetailChain(row))

    const result = await getStudentDetail(STUDENT_ID)

    expect(result?.deletedAt).toBe('2026-03-15T12:00:00Z')
  })

  it('returns null for an admin id — only student rows are returned', async () => {
    // The guard is .eq('role', 'student') (NOT deleted_at): an admin id is filtered
    // out at the query, so Supabase returns no row. Assert both the filter that does
    // the rejecting and the null result, so this is distinct from a generic no-match.
    const ADMIN_USER_ID = 'admin-uuid-1'
    const chain = makeDetailChain(null)
    mockFrom.mockReturnValue(chain)

    const result = await getStudentDetail(ADMIN_USER_ID)

    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls).toContainEqual(['role', 'student'])
    expect(result).toBeNull()
  })

  it('throws when the query returns an error', async () => {
    mockFrom.mockReturnValue(makeDetailChain(null, { message: 'connection refused' }))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getStudentDetail(STUDENT_ID)).rejects.toThrow('Failed to fetch student detail')
    expect(consoleSpy).toHaveBeenCalledWith('[getStudentDetail] Query error:', 'connection refused')
    consoleSpy.mockRestore()
  })
})

// ---- getStudentSessions -----------------------------------------------------

describe('getStudentSessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns mapped sessions and totalCount', async () => {
    const row = makeSessionRow()
    mockSessionsQuery(makeSessionChain([row], 1), {
      answerRows: makeAnswerRows(row.id, row.answeredItems),
    })

    const result = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(result.totalCount).toBe(1)
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]).toEqual({
      sessionId: 'session-1',
      subjectName: 'Meteorology',
      topicName: 'Pressure',
      mode: 'exam',
      scorePercentage: 75,
      totalQuestions: 20,
      correctCount: 15,
      answeredItems: 12,
      startedAt: '2026-04-01T10:00:00Z',
      endedAt: '2026-04-01T10:45:00Z',
    })
  })

  it('derives the answered-item count from answer rows, independent of the question total', async () => {
    const row = makeSessionRow({ answeredItems: 7 })
    mockSessionsQuery(makeSessionChain([row], 1), {
      answerRows: makeAnswerRows(row.id, row.answeredItems),
    })

    const { sessions } = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(sessions[0]?.answeredItems).toBe(7)
    expect(sessions[0]?.answeredItems).not.toBe(sessions[0]?.totalQuestions)
  })

  it('defaults answeredItems to 0 when the session has no recorded answer rows', async () => {
    // No answerRows passed — fetchAnsweredItemCounts returns a Map with no entry for
    // this session id, exercising the `itemCounts.get(row.id) ?? 0` fallback at the
    // call site (queries.ts), not just the Map contract fetchAnsweredItemCounts itself
    // already covers in its own unit tests.
    const row = makeSessionRow({ answeredItems: 0 })
    mockSessionsQuery(makeSessionChain([row], 1))

    const { sessions } = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(sessions[0]?.answeredItems).toBe(0)
  })

  it('throws when the answered-item count lookup fails', async () => {
    const row = makeSessionRow()
    mockSessionsQuery(makeSessionChain([row], 1), {
      answerError: { message: 'answers query failed' },
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      getStudentSessions(STUDENT_ID, { range: 'all', page: 1, sort: 'date', dir: 'desc' }),
    ).rejects.toThrow('Failed to fetch student sessions')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getStudentSessions] Item counts error:',
      'answers query failed',
    )
    consoleSpy.mockRestore()
  })

  it('throws when the answered-item page fetch fails after a successful count', async () => {
    // The count already reported 12 rows, so a page-fetch failure after it must not be
    // masked as a partial/short result — code-style.md §7 "Paginated Fetch Needs a
    // Caller-Level Page-Error Test": a truncated count must never look complete.
    const row = makeSessionRow()
    mockSessionsQuery(makeSessionChain([row], 1), {
      answerRows: makeAnswerRows(row.id, row.answeredItems),
      answerPageError: { message: 'answers page fetch failed' },
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      getStudentSessions(STUDENT_ID, { range: 'all', page: 1, sort: 'date', dir: 'desc' }),
    ).rejects.toThrow('Failed to fetch student sessions')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getStudentSessions] Item counts error:',
      'answers page fetch failed',
    )
    consoleSpy.mockRestore()
  })

  it('maps null subject and topic joins to null', async () => {
    const row = makeSessionRow({ easa_subjects: null, easa_topics: null })
    mockSessionsQuery(makeSessionChain([row], 1))

    const { sessions } = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(sessions[0]?.subjectName).toBeNull()
    expect(sessions[0]?.topicName).toBeNull()
  })

  it('returns empty sessions array and totalCount 0 when no sessions exist', async () => {
    mockSessionsQuery(makeSessionChain([], 0))

    const result = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(result).toEqual({ sessions: [], totalCount: 0 })
  })

  it('defaults totalCount to 0 when count is null', async () => {
    mockSessionsQuery(makeSessionChain([], null))

    const result = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(result.totalCount).toBe(0)
  })

  it('calls .gte() when a time range filter is active', async () => {
    const chain = makeSessionChain([makeSessionRow()], 1)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: '30d',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect((chain.gte as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
    expect((chain.gte as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('ended_at')
  })

  it('does not call .gte() when range is "all"', async () => {
    const chain = makeSessionChain([makeSessionRow()], 1)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect((chain.gte as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('passes correct range offset when requesting page 2', async () => {
    const chain = makeSessionChain([], 30)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 2,
      sort: 'date',
      dir: 'desc',
    })

    // SESSIONS_PAGE_SIZE = 25, page 2 → from=25, to=49
    expect((chain.range as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([25, 49])
  })

  it('passes correct range offset for page 1', async () => {
    const chain = makeSessionChain([], 10)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    // SESSIONS_PAGE_SIZE = 25, page 1 → from=0, to=24
    expect((chain.range as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([0, 24])
  })

  it('passes ascending order flag when dir is "asc"', async () => {
    const chain = makeSessionChain([], 1)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'asc',
    })

    expect((chain.order as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      ascending: true,
    })
  })

  it('passes descending order flag when dir is "desc"', async () => {
    const chain = makeSessionChain([], 1)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect((chain.order as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      ascending: false,
    })
  })

  it('applies a secondary id tiebreak order to prevent row duplication on tied sort columns', async () => {
    const chain = makeSessionChain([], 1)
    mockSessionsQuery(chain)

    await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    const orderCalls = (chain.order as ReturnType<typeof vi.fn>).mock.calls
    // First call: primary sort column; second call: tiebreak by id
    expect(orderCalls).toHaveLength(2)
    expect(orderCalls[1]?.[0]).toBe('id')
  })

  it('throws when the query returns an error', async () => {
    mockSessionsQuery(makeSessionChain([], null, { message: 'timeout' }))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      getStudentSessions(STUDENT_ID, { range: 'all', page: 1, sort: 'date', dir: 'desc' }),
    ).rejects.toThrow('Failed to fetch student sessions')
    expect(consoleSpy).toHaveBeenCalledWith('[getStudentSessions] Query error:', 'timeout')
    consoleSpy.mockRestore()
  })

  it('coerces string wire value for score_percentage to number', async () => {
    // PostgREST serialises NUMERIC as a JSON string; verify coercion to number.
    const row = makeSessionRow({ score_percentage: '73.33' as unknown as number })
    mockSessionsQuery(makeSessionChain([row], 1))

    const { sessions } = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(sessions[0]!.scorePercentage).toBe(73.33)
    expect(typeof sessions[0]!.scorePercentage).toBe('number')
  })

  it('preserves null scorePercentage when wire value is null', async () => {
    const row = makeSessionRow({ score_percentage: null })
    mockSessionsQuery(makeSessionChain([row], 1))

    const { sessions } = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(sessions[0]!.scorePercentage).toBeNull()
  })
})
