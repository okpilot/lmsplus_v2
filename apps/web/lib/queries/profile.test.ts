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

type FromSetup = {
  profileError?: { message: string } | null
  profileData?: Record<string, unknown> | null
  orgData?: Record<string, unknown> | null
  sessions?: { score_percentage: number | null }[]
  answeredCount?: number | null
}

/**
 * Sets up mockFrom to respond per table name.
 * Call order: users (profile), organizations, quiz_sessions, student_responses.
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
  sessions = [{ score_percentage: 80 }, { score_percentage: 60 }],
  answeredCount = 42,
}: FromSetup = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') {
      return buildChain({ data: profileError ? null : profileData, error: profileError })
    }
    if (table === 'organizations') {
      return buildChain({ data: orgData, error: null })
    }
    if (table === 'quiz_sessions') {
      return buildChain({ data: sessions, error: null })
    }
    if (table === 'student_responses') {
      return buildChain({ count: answeredCount, data: null })
    }
    return buildChain({ data: null, error: null })
  })
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

    it('computes averageScore as the rounded mean of completed session scores', async () => {
      mockAuthenticatedUser()
      setupMocks({ sessions: [{ score_percentage: 80 }, { score_percentage: 60 }] })

      const result = await getProfileData()

      // (80 + 60) / 2 = 70
      expect(result.stats.averageScore).toBe(70)
    })

    it('counts only sessions with a non-null score_percentage as completed', async () => {
      mockAuthenticatedUser()
      setupMocks({ sessions: [{ score_percentage: 90 }, { score_percentage: null }] })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(1)
      expect(result.stats.averageScore).toBe(90)
    })

    it('returns totalAnswered from the student_responses count', async () => {
      mockAuthenticatedUser()
      setupMocks({ answeredCount: 42 })

      const result = await getProfileData()

      expect(result.stats.totalAnswered).toBe(42)
    })
  })

  describe('stats edge cases', () => {
    it('returns averageScore of 0 when there are no completed sessions', async () => {
      mockAuthenticatedUser()
      setupMocks({ sessions: [] })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(0)
      expect(result.stats.averageScore).toBe(0)
    })

    it('returns averageScore of 0 when all session scores are null', async () => {
      mockAuthenticatedUser()
      setupMocks({ sessions: [{ score_percentage: null }, { score_percentage: null }] })

      const result = await getProfileData()

      expect(result.stats.totalSessions).toBe(0)
      expect(result.stats.averageScore).toBe(0)
    })

    it('returns totalAnswered of 0 when count is null', async () => {
      mockAuthenticatedUser()
      setupMocks({ answeredCount: null })

      const result = await getProfileData()

      expect(result.stats.totalAnswered).toBe(0)
    })

    it('returns averageScore rounded to the nearest integer', async () => {
      mockAuthenticatedUser()
      setupMocks({ sessions: [{ score_percentage: 85 }, { score_percentage: 86 }] })

      const result = await getProfileData()

      // (85 + 86) / 2 = 85.5 → rounds to 86
      expect(result.stats.averageScore).toBe(86)
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
