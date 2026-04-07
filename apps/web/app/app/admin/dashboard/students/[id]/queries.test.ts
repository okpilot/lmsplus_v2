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
 * Chain: .select().eq().eq().is().maybeSingle() → { data, error }
 */
function makeDetailChain(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is']) {
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
}

function makeUserDetailRow(overrides: Partial<UserDetailRow> = {}): UserDetailRow {
  return {
    id: STUDENT_ID,
    full_name: 'Alice',
    email: 'alice@example.com',
    role: 'student',
    last_active_at: null,
    created_at: '2026-01-01T00:00:00Z',
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
    ...overrides,
  }
}

// ---- getStudentDetail -------------------------------------------------------

describe('getStudentDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns mapped student detail when student is found', async () => {
    const row = makeUserDetailRow()
    mockFrom.mockReturnValue(makeDetailChain(row))

    const result = await getStudentDetail(STUDENT_ID)

    expect(result).toEqual({
      id: STUDENT_ID,
      fullName: 'Alice',
      email: 'alice@example.com',
      role: 'student',
      lastActiveAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    })
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
    mockFrom.mockReturnValue(makeSessionChain([row], 1))

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
      startedAt: '2026-04-01T10:00:00Z',
      endedAt: '2026-04-01T10:45:00Z',
    })
  })

  it('maps null subject and topic joins to null', async () => {
    const row = makeSessionRow({ easa_subjects: null, easa_topics: null })
    mockFrom.mockReturnValue(makeSessionChain([row], 1))

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
    mockFrom.mockReturnValue(makeSessionChain([], 0))

    const result = await getStudentSessions(STUDENT_ID, {
      range: 'all',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })

    expect(result).toEqual({ sessions: [], totalCount: 0 })
  })

  it('defaults totalCount to 0 when count is null', async () => {
    mockFrom.mockReturnValue(makeSessionChain([], null))

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
    mockFrom.mockReturnValue(chain)

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
    mockFrom.mockReturnValue(chain)

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
    mockFrom.mockReturnValue(chain)

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
    mockFrom.mockReturnValue(chain)

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
    mockFrom.mockReturnValue(chain)

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
    mockFrom.mockReturnValue(chain)

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

  it('throws when the query returns an error', async () => {
    mockFrom.mockReturnValue(makeSessionChain([], null, { message: 'timeout' }))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      getStudentSessions(STUDENT_ID, { range: 'all', page: 1, sort: 'date', dir: 'desc' }),
    ).rejects.toThrow('Failed to fetch student sessions')
    expect(consoleSpy).toHaveBeenCalledWith('[getStudentSessions] Query error:', 'timeout')
    consoleSpy.mockRestore()
  })
})
