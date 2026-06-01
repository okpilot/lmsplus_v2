import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({
  requireAdmin: mockRequireAdmin,
}))

// adminClient is a module-level singleton created at import time.
// Mock the entire module to prevent real Supabase client creation.
vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockFrom,
  },
}))

// ---- Subject under test ---------------------------------------------------

import { getDashboardKpis, getDashboardStudents, getRecentSessions, getWeakTopics } from './queries'
import { type DashboardFilters, STUDENTS_PAGE_SIZE } from './types'

// ---- Helpers ---------------------------------------------------------------

const DEFAULT_ORG_ID = 'org-1'

const mockAuthRpc = vi.hoisted(() => vi.fn())

function makeAdminContext(overrides: Partial<{ organizationId: string }> = {}) {
  return {
    supabase: { rpc: mockAuthRpc } as unknown,
    userId: 'admin-1',
    organizationId: DEFAULT_ORG_ID,
    ...overrides,
  }
}

/**
 * Builds a chainable mock query object for adminClient.from() chains.
 * Every builder method returns the same chain; await resolves with { data, error }.
 */
function makeFromChain(data: unknown[], error: { message: string } | null = null) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'not', 'order', 'limit', 'gte']) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Supabase query builder
  chain.then = vi
    .fn()
    .mockImplementation(
      (resolve: (value: { data: unknown[]; error: { message: string } | null }) => void) => {
        resolve({ data, error })
        return Promise.resolve({ data, error })
      },
    )
  return chain
}

const BASE_FILTERS: DashboardFilters = {
  range: '30d',
  page: 1,
  sort: 'name',
  dir: 'asc',
  status: undefined,
}

// A row as returned by the get_admin_dashboard_students RPC (already sorted + paginated
// in SQL). total_count is the count(*) OVER() window value — the same on every row.
type RpcStudentRow = {
  id: string
  full_name: string | null
  email: string
  last_active_at: string | null
  deleted_at: string | null
  session_count: number
  avg_score: number | null
  mastery: number
  total_count: number
}

function makeRpcRow(overrides: Partial<RpcStudentRow> = {}): RpcStudentRow {
  return {
    id: 'u1',
    full_name: 'Alice',
    email: 'alice@example.com',
    last_active_at: null,
    deleted_at: null,
    session_count: 0,
    avg_score: null,
    mastery: 0,
    total_count: 1,
    ...overrides,
  }
}

// getDashboardStudents now makes a single get_admin_dashboard_students RPC call; sorting,
// filtering, and pagination happen in SQL. These tests cover the row→DashboardStudent
// mapping, the totalCount read, and the params the helper forwards to the RPC.
function mockStudentsRpc(rows: RpcStudentRow[], error: { message: string } | null = null): void {
  mockAuthRpc.mockResolvedValue({ data: error ? null : rows, error })
}

// ---- getDashboardStudents -------------------------------------------------

describe('getDashboardStudents', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns empty students and totalCount 0 when the RPC returns no rows', async () => {
    mockStudentsRpc([])

    const result = await getDashboardStudents(BASE_FILTERS)

    expect(result).toEqual({ students: [], totalCount: 0 })
  })

  it('maps an RPC row to a DashboardStudent', async () => {
    mockStudentsRpc([
      makeRpcRow({
        id: 'u1',
        full_name: 'Bob',
        email: 'bob@test.com',
        session_count: 5,
        avg_score: 78.5,
        mastery: 60,
      }),
    ])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students).toHaveLength(1)
    expect(students[0]).toMatchObject({
      id: 'u1',
      fullName: 'Bob',
      email: 'bob@test.com',
      sessionCount: 5,
      avgScore: 78.5,
      mastery: 60,
    })
  })

  it('passes lastActiveAt through unchanged from the RPC row', async () => {
    const isoDate = '2026-05-20T10:30:00.000Z'
    mockStudentsRpc([makeRpcRow({ last_active_at: isoDate })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]?.lastActiveAt).toBe(isoDate)
  })

  it('maps a null avg_score to null and zero counts to zero', async () => {
    mockStudentsRpc([makeRpcRow({ session_count: 0, avg_score: null, mastery: 0 })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]).toMatchObject({ sessionCount: 0, avgScore: null, mastery: 0 })
  })

  it('marks a student active when deleted_at is null', async () => {
    mockStudentsRpc([makeRpcRow({ deleted_at: null })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]?.isActive).toBe(true)
  })

  it('marks a student inactive when deleted_at is set', async () => {
    mockStudentsRpc([makeRpcRow({ deleted_at: '2026-01-01T00:00:00Z' })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]?.isActive).toBe(false)
  })

  it('flags recent activity when last_active_at is within the past 7 days', async () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    mockStudentsRpc([makeRpcRow({ last_active_at: recentDate })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]?.hasRecentActivity).toBe(true)
  })

  it('does not flag recent activity when last_active_at is older than 7 days', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    mockStudentsRpc([makeRpcRow({ last_active_at: oldDate })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]?.hasRecentActivity).toBe(false)
  })

  it('does not flag recent activity when last_active_at is null', async () => {
    mockStudentsRpc([makeRpcRow({ last_active_at: null })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]?.hasRecentActivity).toBe(false)
  })

  // -- totalCount (count(*) OVER() window) --

  it('reads totalCount from the first row total_count, the same on every row', async () => {
    mockStudentsRpc([
      makeRpcRow({ id: 'u1', email: 'a@test.com', total_count: 42 }),
      makeRpcRow({ id: 'u2', email: 'b@test.com', total_count: 42 }),
    ])

    const { totalCount } = await getDashboardStudents(BASE_FILTERS)

    expect(totalCount).toBe(42)
  })

  it('returns totalCount 0 on an out-of-range page that yields no rows', async () => {
    mockStudentsRpc([])

    const { students, totalCount } = await getDashboardStudents({ ...BASE_FILTERS, page: 99 })

    expect(students).toHaveLength(0)
    expect(totalCount).toBe(0)
  })

  // -- error / guard paths --

  it('throws and logs when the RPC fails', async () => {
    mockAuthRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getDashboardStudents(BASE_FILTERS)).rejects.toThrow('Failed to fetch students')
    expect(consoleSpy).toHaveBeenCalledWith('[getDashboardStudents] RPC error:', 'rpc failed')
    consoleSpy.mockRestore()
  })

  it('treats a non-array RPC response as no students', async () => {
    // Supabase RPC can return a scalar (e.g. null) instead of an array; the
    // Array.isArray guard must fall back to an empty result.
    mockAuthRpc.mockResolvedValue({ data: null, error: null })

    const { students, totalCount } = await getDashboardStudents(BASE_FILTERS)

    expect(students).toEqual([])
    expect(totalCount).toBe(0)
  })

  it('coerces string wire values for bigint/numeric columns to numbers', async () => {
    // PostgREST serialises BIGINT/NUMERIC as JSON strings; verify coercion to number.
    mockStudentsRpc([
      makeRpcRow({
        session_count: '7' as unknown as number,
        avg_score: '65.5' as unknown as number,
        mastery: '80' as unknown as number,
        total_count: '99' as unknown as number,
      }),
    ])

    const { students, totalCount } = await getDashboardStudents(BASE_FILTERS)

    expect(totalCount).toBe(99)
    expect(typeof totalCount).toBe('number')
    expect(students[0]!.sessionCount).toBe(7)
    expect(typeof students[0]!.sessionCount).toBe('number')
    expect(students[0]!.avgScore).toBe(65.5)
    expect(typeof students[0]!.avgScore).toBe('number')
    expect(students[0]!.mastery).toBe(80)
    expect(typeof students[0]!.mastery).toBe('number')
  })

  it('preserves null avgScore when wire value is null', async () => {
    mockStudentsRpc([makeRpcRow({ avg_score: null })])

    const { students } = await getDashboardStudents(BASE_FILTERS)

    expect(students[0]!.avgScore).toBeNull()
  })

  // -- params forwarded to the RPC (sort/filter/paginate now run in SQL) --

  it('requests p_status null when no status filter is set', async () => {
    mockStudentsRpc([])

    await getDashboardStudents({ ...BASE_FILTERS, status: undefined })

    expect(mockAuthRpc).toHaveBeenCalledWith(
      'get_admin_dashboard_students',
      expect.objectContaining({ p_status: null }),
    )
  })

  it('requests p_status "active" when filtering to active students', async () => {
    mockStudentsRpc([])

    await getDashboardStudents({ ...BASE_FILTERS, status: 'active' })

    expect(mockAuthRpc).toHaveBeenCalledWith(
      'get_admin_dashboard_students',
      expect.objectContaining({ p_status: 'active' }),
    )
  })

  it('requests p_status "inactive" when filtering to inactive students', async () => {
    mockStudentsRpc([])

    await getDashboardStudents({ ...BASE_FILTERS, status: 'inactive' })

    expect(mockAuthRpc).toHaveBeenCalledWith(
      'get_admin_dashboard_students',
      expect.objectContaining({ p_status: 'inactive' }),
    )
  })

  it('requests the chosen sort column and direction from the RPC', async () => {
    mockStudentsRpc([])

    await getDashboardStudents({ ...BASE_FILTERS, sort: 'mastery', dir: 'desc' })

    expect(mockAuthRpc).toHaveBeenCalledWith(
      'get_admin_dashboard_students',
      expect.objectContaining({ p_sort: 'mastery', p_dir: 'desc' }),
    )
  })

  it('requests the page window as limit = page size and offset = (page - 1) * page size', async () => {
    mockStudentsRpc([])

    await getDashboardStudents({ ...BASE_FILTERS, page: 3 })

    expect(mockAuthRpc).toHaveBeenCalledWith(
      'get_admin_dashboard_students',
      expect.objectContaining({ p_limit: STUDENTS_PAGE_SIZE, p_offset: 2 * STUDENTS_PAGE_SIZE }),
    )
  })
})

// ---- getDashboardKpis -----------------------------------------------------

describe('getDashboardKpis', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns mapped KPI fields from RPC response', async () => {
    mockAuthRpc.mockResolvedValue({
      data: {
        activeStudents: 10,
        totalStudents: 20,
        avgMastery: 65.5,
        sessionsThisPeriod: 42,
        weakestSubject: { name: 'Meteorology', short: 'MET', avgMastery: 45 },
        examReadyStudents: 3,
      },
      error: null,
    })

    const result = await getDashboardKpis('30d')

    expect(result).toEqual({
      activeStudents: 10,
      totalStudents: 20,
      avgMastery: 65.5,
      sessionsThisPeriod: 42,
      weakestSubject: { name: 'Meteorology', short: 'MET', avgMastery: 45 },
      examReadyStudents: 3,
    })
  })

  it('coerces a string weakestSubject.avgMastery wire value to a number', async () => {
    // PostgREST serializes the NUMERIC avgMastery inside the JSON payload as a string.
    mockAuthRpc.mockResolvedValue({
      data: {
        activeStudents: 10,
        totalStudents: 20,
        avgMastery: '65.5',
        sessionsThisPeriod: 42,
        weakestSubject: { name: 'Meteorology', short: 'MET', avgMastery: '45' },
        examReadyStudents: 3,
      },
      error: null,
    })

    const result = await getDashboardKpis('30d')

    expect(result.avgMastery).toBe(65.5)
    expect(result.weakestSubject?.avgMastery).toBe(45)
    expect(typeof result.weakestSubject?.avgMastery).toBe('number')
  })

  it('defaults numeric fields to 0 and weakestSubject to null when RPC returns empty object', async () => {
    mockAuthRpc.mockResolvedValue({ data: {}, error: null })

    const result = await getDashboardKpis('30d')

    expect(result.activeStudents).toBe(0)
    expect(result.totalStudents).toBe(0)
    expect(result.avgMastery).toBe(0)
    expect(result.sessionsThisPeriod).toBe(0)
    expect(result.examReadyStudents).toBe(0)
    expect(result.weakestSubject).toBeNull()
  })

  it('throws when RPC fails', async () => {
    mockAuthRpc.mockResolvedValue({ data: null, error: { message: 'timeout' } })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getDashboardKpis('7d')).rejects.toThrow('Failed to fetch dashboard KPIs')
    expect(consoleSpy).toHaveBeenCalledWith('[getDashboardKpis] RPC error:', 'timeout')
    consoleSpy.mockRestore()
  })

  it('returns all-zero defaults when RPC returns null data', async () => {
    mockAuthRpc.mockResolvedValue({ data: null, error: null })
    const result = await getDashboardKpis('30d')
    expect(result).toEqual({
      activeStudents: 0,
      totalStudents: 0,
      avgMastery: 0,
      sessionsThisPeriod: 0,
      weakestSubject: null,
      examReadyStudents: 0,
    })
  })
})

// ---- getWeakTopics --------------------------------------------------------

describe('getWeakTopics', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns mapped weak topics from RPC response', async () => {
    mockAuthRpc.mockResolvedValue({
      data: [
        {
          topic_id: 't1',
          topic_name: 'Pressure',
          subject_name: 'Meteorology',
          subject_short: 'MET',
          avg_score: 42.3,
          student_count: 8,
        },
      ],
      error: null,
    })

    const result = await getWeakTopics()

    expect(result).toEqual([
      {
        topicId: 't1',
        topicName: 'Pressure',
        subjectName: 'Meteorology',
        subjectShort: 'MET',
        avgScore: 42.3,
        studentCount: 8,
      },
    ])
  })

  it('returns empty array when RPC returns no rows', async () => {
    mockAuthRpc.mockResolvedValue({ data: [], error: null })

    const result = await getWeakTopics()

    expect(result).toEqual([])
  })

  it('throws when RPC fails', async () => {
    mockAuthRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getWeakTopics()).rejects.toThrow('Failed to fetch weak topics')
    consoleSpy.mockRestore()
  })

  it('returns empty array when RPC returns a non-array value with no error', async () => {
    // Guards against scalar RPC responses (e.g. object instead of array)
    mockAuthRpc.mockResolvedValue({ data: { unexpected: true }, error: null })

    const result = await getWeakTopics()

    expect(result).toEqual([])
  })

  it('coerces string wire values for avg_score and student_count to numbers', async () => {
    // PostgREST serialises NUMERIC/BIGINT as JSON strings; verify coercion.
    mockAuthRpc.mockResolvedValue({
      data: [
        {
          topic_id: 't1',
          topic_name: 'Pressure',
          subject_name: 'Meteorology',
          subject_short: 'MET',
          avg_score: '42.75',
          student_count: '12',
        },
      ],
      error: null,
    })

    const result = await getWeakTopics()

    expect(result[0]!.avgScore).toBe(42.75)
    expect(typeof result[0]!.avgScore).toBe('number')
    expect(result[0]!.studentCount).toBe(12)
    expect(typeof result[0]!.studentCount).toBe('number')
  })
})

// ---- getRecentSessions ----------------------------------------------------

describe('getRecentSessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns mapped recent sessions', async () => {
    const chain = makeFromChain([
      {
        id: 's1',
        mode: 'exam',
        score_percentage: 88,
        ended_at: '2026-04-01T10:00:00Z',
        users: { full_name: 'Alice' },
        easa_subjects: { name: 'Meteorology' },
      },
    ])
    mockFrom.mockReturnValue(chain)

    const result = await getRecentSessions('30d')

    expect(result).toEqual([
      {
        sessionId: 's1',
        studentName: 'Alice',
        subjectName: 'Meteorology',
        mode: 'exam',
        scorePercentage: 88,
        endedAt: '2026-04-01T10:00:00Z',
      },
    ])
  })

  it('maps null join relations to null studentName and subjectName', async () => {
    const chain = makeFromChain([
      {
        id: 's2',
        mode: 'training',
        score_percentage: null,
        ended_at: '2026-04-02T10:00:00Z',
        users: null,
        easa_subjects: null,
      },
    ])
    mockFrom.mockReturnValue(chain)

    const result = await getRecentSessions('all')

    expect(result[0]).toMatchObject({ studentName: null, subjectName: null })
  })

  it('returns empty array when query returns no rows', async () => {
    mockFrom.mockReturnValue(makeFromChain([]))

    const result = await getRecentSessions('7d')

    expect(result).toEqual([])
  })

  it('throws when query fails', async () => {
    mockFrom.mockReturnValue(makeFromChain([], { message: 'query error' }))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getRecentSessions('30d')).rejects.toThrow('Failed to fetch recent sessions')
    consoleSpy.mockRestore()
  })

  it('returns empty array when query returns a non-array value with no error', async () => {
    // Guards against scalar responses from the Supabase query builder
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'is', 'not', 'order', 'limit', 'gte']) {
      chain[method] = vi.fn().mockReturnValue(chain)
    }
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock for Supabase query builder
    chain.then = vi
      .fn()
      .mockImplementation((resolve: (value: { data: unknown; error: null }) => void) => {
        resolve({ data: null, error: null })
        return Promise.resolve({ data: null, error: null })
      })
    mockFrom.mockReturnValue(chain)

    const result = await getRecentSessions('7d')

    expect(result).toEqual([])
  })

  it('coerces string wire value for score_percentage to number', async () => {
    // PostgREST serialises NUMERIC as a JSON string; verify coercion to number.
    const chain = makeFromChain([
      {
        id: 's3',
        mode: 'mock_exam',
        score_percentage: '88.50',
        ended_at: '2026-05-01T12:00:00Z',
        users: { full_name: 'Bob' },
        easa_subjects: { name: 'Navigation' },
      },
    ])
    mockFrom.mockReturnValue(chain)

    const result = await getRecentSessions('30d')

    expect(result[0]!.scorePercentage).toBe(88.5)
    expect(typeof result[0]!.scorePercentage).toBe('number')
  })

  it('preserves null scorePercentage when wire value is null', async () => {
    const chain = makeFromChain([
      {
        id: 's4',
        mode: 'quick_quiz',
        score_percentage: null,
        ended_at: '2026-05-01T12:00:00Z',
        users: null,
        easa_subjects: null,
      },
    ])
    mockFrom.mockReturnValue(chain)

    const result = await getRecentSessions('all')

    expect(result[0]!.scorePercentage).toBeNull()
  })
})
