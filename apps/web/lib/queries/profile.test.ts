import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getProfileData } from './profile'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

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

type StatsRow = { total_sessions: number | string; avg_score: number | string | null }

type FromSetup = {
  profileError?: { message: string } | null
  profileData?: Record<string, unknown> | null
  orgData?: Record<string, unknown> | null
  statsRow?: StatsRow | null
  answeredCount?: number | null
}

/**
 * Sets up the mocked Supabase client.
 * `from` responds per table name (users -> profile, organizations, student_responses);
 * profile stats come from the mocked `get_student_profile_stats` RPC (mockRpc).
 */
function setupMocks({
  profileError = null,
  profileData = {
    full_name: 'Alice Pilot',
    email: 'alice@example.com',
    created_at: '2026-01-01T00:00:00Z',
    organization_id: ORG_ID,
  },
  orgData = { name: 'Sky Academy' },
  statsRow = { total_sessions: 2, avg_score: 70 },
  answeredCount = 42,
}: FromSetup = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') {
      return buildChain({ data: profileError ? null : profileData, error: profileError })
    }
    if (table === 'organizations') {
      return buildChain({ data: orgData, error: null })
    }
    if (table === 'student_responses') {
      return buildChain({ count: answeredCount, data: null })
    }
    return buildChain({ data: null, error: null })
  })
  mockRpc.mockResolvedValue({ data: statsRow === null ? null : [statsRow], error: null })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getProfileData', () => {
  describe('auth guard', () => {
    it('throws when auth returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'token expired' },
      })

      await expect(getProfileData()).rejects.toThrow('Auth error: token expired')
    })

    it('throws when no user is in the session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      await expect(getProfileData()).rejects.toThrow('Not authenticated')
    })
  })

  describe('happy path', () => {
    it('returns assembled profile with name, email, org, memberSince, and stats', async () => {
      mockAuthenticatedUser()
      setupMocks()

      const result = await getProfileData()

      expect(result.fullName).toBe('Alice Pilot')
      expect(result.email).toBe('alice@example.com')
      expect(result.organizationName).toBe('Sky Academy')
      expect(result.memberSince).toBe('2026-01-01T00:00:00Z')
    })

    it('returns the rounded average score reported by the stats RPC', async () => {
      mockAuthenticatedUser()
      setupMocks({ statsRow: { total_sessions: 2, avg_score: 85.5 } })

      const result = await getProfileData()

      // 85.5 rounds to 86
      expect(result.stats.averageScore).toBe(86)
    })

    it('returns totalSessions reported by the stats RPC', async () => {
      mockAuthenticatedUser()
      setupMocks({ statsRow: { total_sessions: 7, avg_score: 70 } })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(7)
    })

    it('returns totalAnswered from the student_responses count', async () => {
      mockAuthenticatedUser()
      setupMocks({ answeredCount: 42 })

      const result = await getProfileData()

      expect(result.stats.totalAnswered).toBe(42)
    })
  })

  describe('stats edge cases', () => {
    it('returns averageScore of 0 when the RPC reports no completed sessions', async () => {
      mockAuthenticatedUser()
      setupMocks({ statsRow: { total_sessions: 0, avg_score: null } })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(0)
      expect(result.stats.averageScore).toBe(0)
    })

    it('coerces a string avg_score from PostgREST into a rounded number', async () => {
      mockAuthenticatedUser()
      // Postgres numeric AVG / bigint COUNT serialize as JSON strings.
      setupMocks({ statsRow: { total_sessions: '2', avg_score: '85.5' } })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(2)
      expect(result.stats.averageScore).toBe(86)
    })

    it('returns totalSessions 0 and averageScore 0 when the RPC payload is not an array', async () => {
      mockAuthenticatedUser()
      setupMocks()
      mockRpc.mockResolvedValue({ data: { total_sessions: 3, avg_score: 50 }, error: null })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(0)
      expect(result.stats.averageScore).toBe(0)
    })

    it('returns totalSessions 0 and averageScore 0 when the RPC returns an empty array', async () => {
      mockAuthenticatedUser()
      setupMocks()
      // Empty array: row is undefined, both values fall back to 0.
      mockRpc.mockResolvedValue({ data: [], error: null })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(0)
      expect(result.stats.averageScore).toBe(0)
    })

    it('returns averageScore of 0 when sessions exist but avg_score is null', async () => {
      mockAuthenticatedUser()
      // total_sessions > 0 but avg_score is null — the score guard short-circuits to 0.
      setupMocks({ statsRow: { total_sessions: 5, avg_score: null } })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(5)
      expect(result.stats.averageScore).toBe(0)
    })

    it('throws when the stats RPC returns an error', async () => {
      mockAuthenticatedUser()
      setupMocks()
      mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

      await expect(getProfileData()).rejects.toThrow('Failed to fetch profile stats: rpc boom')
    })

    it('returns totalAnswered of 0 when count is null', async () => {
      mockAuthenticatedUser()
      setupMocks({ answeredCount: null })

      const result = await getProfileData()

      expect(result.stats.totalAnswered).toBe(0)
    })
  })

  describe('organization lookup', () => {
    it('returns organizationName as null when the org row is missing', async () => {
      mockAuthenticatedUser()
      setupMocks({ orgData: null })

      const result = await getProfileData()

      expect(result.organizationName).toBeNull()
    })
  })

  describe('profile fetch error', () => {
    it('throws when the users table query returns an error', async () => {
      mockAuthenticatedUser()
      setupMocks({ profileError: { message: 'relation not found' } })

      await expect(getProfileData()).rejects.toThrow('Failed to load profile')
    })

    it('throws when the users table returns null data', async () => {
      mockAuthenticatedUser()
      setupMocks({ profileData: null })

      await expect(getProfileData()).rejects.toThrow('Failed to load profile')
    })
  })
})
