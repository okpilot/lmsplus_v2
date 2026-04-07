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

type StatRow = { user_id: string; session_count: number; avg_score: number | null; mastery: number }
type UserRow = {
  id: string
  full_name: string | null
  email: string
  last_active_at: string | null
  deleted_at: string | null
}

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    full_name: 'Alice',
    email: 'alice@example.com',
    last_active_at: null,
    deleted_at: null,
    ...overrides,
  }
}

function makeStatRow(overrides: Partial<StatRow> = {}): StatRow {
  return { user_id: 'u1', session_count: 0, avg_score: null, mastery: 0, ...overrides }
}

/**
 * Sets up getDashboardStudents mocks: one adminRpc call (stats) + one adminClient.from call (users).
 * The RPC is called first, then the from chain.
 */
function mockStudents(opts: {
  statsData?: StatRow[]
  statsError?: { message: string } | null
  usersData?: UserRow[]
  usersError?: { message: string } | null
}) {
  const statsData = opts.statsData ?? []
  const statsError = opts.statsError ?? null
  const usersData = opts.usersData ?? []
  const usersError = opts.usersError ?? null

  mockAuthRpc.mockResolvedValue({ data: statsData, error: statsError })
  const chain = makeFromChain(usersData, usersError)
  mockFrom.mockReturnValue(chain)
  return chain
}

// ---- getDashboardStudents -------------------------------------------------

describe('getDashboardStudents', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRequireAdmin.mockResolvedValue(makeAdminContext())
  })

  it('returns empty students and totalCount 0 when DB returns no users', async () => {
    mockStudents({ usersData: [] })

    const result = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(result).toEqual({ students: [], totalCount: 0 })
  })

  it('merges user row with matching stat row', async () => {
    const user = makeUserRow({ id: 'u1', full_name: 'Bob', email: 'bob@test.com' })
    const stat = makeStatRow({ user_id: 'u1', session_count: 5, avg_score: 78.5, mastery: 60 })
    mockStudents({ usersData: [user], statsData: [stat] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

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

  it('defaults sessionCount to 0, avgScore to null, and mastery to 0 when no stat row exists', async () => {
    const user = makeUserRow({ id: 'u1' })
    mockStudents({ usersData: [user], statsData: [] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students[0]).toMatchObject({ sessionCount: 0, avgScore: null, mastery: 0 })
  })

  it('sets isActive true when deleted_at is null', async () => {
    mockStudents({ usersData: [makeUserRow({ deleted_at: null })] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students[0]?.isActive).toBe(true)
  })

  it('sets isActive false when deleted_at is set', async () => {
    mockStudents({ usersData: [makeUserRow({ deleted_at: '2026-01-01T00:00:00Z' })] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students[0]?.isActive).toBe(false)
  })

  it('sets hasRecentActivity true when last_active_at is within the past 7 days', async () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    mockStudents({ usersData: [makeUserRow({ last_active_at: recentDate })] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students[0]?.hasRecentActivity).toBe(true)
  })

  it('sets hasRecentActivity false when last_active_at is older than 7 days', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    mockStudents({ usersData: [makeUserRow({ last_active_at: oldDate })] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students[0]?.hasRecentActivity).toBe(false)
  })

  it('sets hasRecentActivity false when last_active_at is null', async () => {
    mockStudents({ usersData: [makeUserRow({ last_active_at: null })] })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students[0]?.hasRecentActivity).toBe(false)
  })

  // -- sort --

  it('sorts by name ascending', async () => {
    const users = [
      makeUserRow({ id: 'u1', full_name: 'Zelda', email: 'z@test.com' }),
      makeUserRow({ id: 'u2', full_name: 'Alice', email: 'a@test.com' }),
    ]
    mockStudents({ usersData: users })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(students.map((s) => s.fullName)).toEqual(['Alice', 'Zelda'])
  })

  it('sorts by name descending', async () => {
    const users = [
      makeUserRow({ id: 'u1', full_name: 'Alice', email: 'a@test.com' }),
      makeUserRow({ id: 'u2', full_name: 'Zelda', email: 'z@test.com' }),
    ]
    mockStudents({ usersData: users })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'desc',
      status: undefined,
    })

    expect(students.map((s) => s.fullName)).toEqual(['Zelda', 'Alice'])
  })

  it('sorts by mastery ascending', async () => {
    const users = [
      makeUserRow({ id: 'u1', email: 'a@test.com' }),
      makeUserRow({ id: 'u2', email: 'b@test.com' }),
    ]
    const stats = [
      makeStatRow({ user_id: 'u1', mastery: 80 }),
      makeStatRow({ user_id: 'u2', mastery: 30 }),
    ]
    mockStudents({ usersData: users, statsData: stats })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'mastery',
      dir: 'asc',
      status: undefined,
    })

    expect(students.map((s) => s.mastery)).toEqual([30, 80])
  })

  it('sorts by session count descending', async () => {
    const users = [
      makeUserRow({ id: 'u1', email: 'a@test.com' }),
      makeUserRow({ id: 'u2', email: 'b@test.com' }),
    ]
    const stats = [
      makeStatRow({ user_id: 'u1', session_count: 2 }),
      makeStatRow({ user_id: 'u2', session_count: 9 }),
    ]
    mockStudents({ usersData: users, statsData: stats })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'sessions',
      dir: 'desc',
      status: undefined,
    })

    expect(students.map((s) => s.sessionCount)).toEqual([9, 2])
  })

  it('sorts by avgScore ascending, treating null as lowest', async () => {
    const users = [
      makeUserRow({ id: 'u1', email: 'a@test.com' }),
      makeUserRow({ id: 'u2', email: 'b@test.com' }),
    ]
    const stats = [
      makeStatRow({ user_id: 'u1', avg_score: 55 }),
      makeStatRow({ user_id: 'u2', avg_score: null }),
    ]
    mockStudents({ usersData: users, statsData: stats })

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'avgScore',
      dir: 'asc',
      status: undefined,
    })

    // null maps to -1, so null comes first in ascending
    expect(students.map((s) => s.avgScore)).toEqual([null, 55])
  })

  // -- pagination --

  it('returns first page of 10 students and correct totalCount', async () => {
    const users = Array.from({ length: 30 }, (_, i) =>
      makeUserRow({ id: `u${i}`, email: `u${i}@test.com` }),
    )
    mockStudents({ usersData: users })

    const { students, totalCount } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(totalCount).toBe(30)
    expect(students).toHaveLength(10)
  })

  it('returns empty array for page past the last page', async () => {
    const users = Array.from({ length: 30 }, (_, i) =>
      makeUserRow({
        id: `u${i}`,
        email: `u${i}@test.com`,
        full_name: `User ${String(i).padStart(2, '0')}`,
      }),
    )
    mockStudents({ usersData: users })

    const { students, totalCount } = await getDashboardStudents({
      range: '30d',
      page: 4,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(totalCount).toBe(30)
    expect(students).toHaveLength(0)
  })

  it('returns empty students when page exceeds total pages', async () => {
    const users = [makeUserRow()]
    mockStudents({ usersData: users })

    const { students, totalCount } = await getDashboardStudents({
      range: '30d',
      page: 99,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    expect(totalCount).toBe(1)
    expect(students).toHaveLength(0)
  })

  // -- error paths --

  it('throws when the stats RPC fails', async () => {
    mockAuthRpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    mockFrom.mockReturnValue(makeFromChain([]))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      getDashboardStudents({ range: '30d', page: 1, sort: 'name', dir: 'asc', status: undefined }),
    ).rejects.toThrow('Failed to fetch student stats')
    expect(consoleSpy).toHaveBeenCalledWith('[getDashboardStudents] Stats RPC error:', 'rpc failed')
    consoleSpy.mockRestore()
  })

  it('throws when the users query fails', async () => {
    mockAuthRpc.mockResolvedValue({ data: [], error: null })
    mockFrom.mockReturnValue(makeFromChain([], { message: 'connection refused' }))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      getDashboardStudents({ range: '30d', page: 1, sort: 'name', dir: 'asc', status: undefined }),
    ).rejects.toThrow('Failed to fetch students')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getDashboardStudents] Users query error:',
      'connection refused',
    )
    consoleSpy.mockRestore()
  })

  it('treats stats as empty when RPC returns a non-array value with no error', async () => {
    // Supabase RPC can return a scalar (e.g. null, object) instead of an array
    // when the function signature changes. The Array.isArray guard must fall back to [].
    mockAuthRpc.mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue(makeFromChain([makeUserRow({ id: 'u1' })]))

    const { students } = await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    // No stat row found → defaults applied
    expect(students).toHaveLength(1)
    expect(students[0]).toMatchObject({ sessionCount: 0, avgScore: null, mastery: 0 })
  })

  // -- status filter --

  it('applies no deleted_at filter when status is undefined (shows all students)', async () => {
    const chain = mockStudents({ usersData: [makeUserRow()] })

    await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })

    // Neither .is() nor .not() should be called with 'deleted_at' filtering
    const isCall = (chain.is as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'deleted_at',
    )
    const notCall = (chain.not as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'deleted_at',
    )
    expect(isCall).toBeUndefined()
    expect(notCall).toBeUndefined()
  })

  it('filters to non-deleted students when status is "active"', async () => {
    const chain = mockStudents({ usersData: [makeUserRow()] })

    await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: 'active',
    })

    // .is('deleted_at', null) must be called
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    // .not() must NOT be called with deleted_at
    const notCall = (chain.not as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'deleted_at',
    )
    expect(notCall).toBeUndefined()
  })

  it('filters to soft-deleted students only when status is "inactive"', async () => {
    const chain = mockStudents({ usersData: [] })

    await getDashboardStudents({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: 'inactive',
    })

    // .not('deleted_at', 'is', null) must be called
    expect(chain.not).toHaveBeenCalledWith('deleted_at', 'is', null)
    // .is() must NOT be called with deleted_at
    const isCall = (chain.is as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === 'deleted_at',
    )
    expect(isCall).toBeUndefined()
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
})
