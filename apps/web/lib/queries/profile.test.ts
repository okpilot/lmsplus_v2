import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetSessionUser, mockGetCallerProfile, mockFrom } = vi.hoisted(() => ({
  mockGetCallerProfile: vi.fn(),
  mockGetSessionUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

vi.mock('@/lib/auth/get-caller-profile', () => ({
  getCallerProfile: (...args: unknown[]) => mockGetCallerProfile(...args),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    from: mockFrom,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { getProfileData } from './profile'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'

function mockAuthenticatedUser() {
  mockGetSessionUser.mockResolvedValue({ id: USER_ID })
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
  orgError?: { message: string; code?: string } | null
}

/**
 * Sets up the mocked Supabase client.
 * The profile row comes from the mocked getCallerProfile; `from` serves the organizations table.
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
  orgError = null,
}: FromSetup = {}) {
  mockGetCallerProfile.mockResolvedValue({
    data: profileError ? null : profileData,
    error: profileError,
  })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return buildChain({ data: orgError ? null : orgData, error: orgError })
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
    it('throws when no user is in the session', async () => {
      mockGetSessionUser.mockResolvedValue(null)

      await expect(getProfileData()).rejects.toThrow('Not authenticated')
    })
  })

  describe('happy path', () => {
    it('returns assembled profile with name, email, org, and memberSince', async () => {
      mockAuthenticatedUser()
      setupMocks()

      const result = await getProfileData()

      expect(result.fullName).toBe('Alice Pilot')
      expect(result.email).toBe('alice@example.com')
      expect(result.organizationName).toBe('Sky Academy')
      expect(result.memberSince).toBe('2026-01-01T00:00:00Z')
    })

    it('reads the caller users row through the shared per-render profile read only', async () => {
      mockAuthenticatedUser()
      setupMocks()

      await getProfileData()

      expect(mockGetCallerProfile).toHaveBeenCalledWith(USER_ID)
      expect(mockFrom).not.toHaveBeenCalledWith('users')
    })
  })

  describe('organization lookup', () => {
    it('returns organizationName as null when the org row is missing', async () => {
      mockAuthenticatedUser()
      setupMocks({ orgData: null })

      const result = await getProfileData()

      expect(result.organizationName).toBeNull()
    })

    it('logs the error and returns organizationName as null when the org query errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAuthenticatedUser()
      setupMocks({ orgError: { message: 'org read failed', code: '42501' } })

      const result = await getProfileData()

      expect(result.organizationName).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith('[getProfile] org lookup error:', 'org read failed')
      // Profile fields are still populated despite the org error
      expect(result.fullName).toBe('Alice Pilot')
      expect(result.email).toBe('alice@example.com')
      consoleSpy.mockRestore()
    })

    it('does not log and returns organizationName as null when org is soft-deleted (PGRST116)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAuthenticatedUser()
      setupMocks({ orgError: { message: 'no rows', code: 'PGRST116' } })

      const result = await getProfileData()

      expect(result.organizationName).toBeNull()
      expect(consoleSpy).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('profile fetch error', () => {
    it('throws when the users table query returns an error', async () => {
      mockAuthenticatedUser()
      setupMocks({ profileError: { message: 'relation not found' } })

      await expect(getProfileData()).rejects.toThrow(
        new Error('Failed to load profile: relation not found'),
      )
    })

    it('throws when the users table returns null data', async () => {
      mockAuthenticatedUser()
      setupMocks({ profileData: null })

      await expect(getProfileData()).rejects.toThrow(new Error('Failed to load profile'))
    })
  })
})
