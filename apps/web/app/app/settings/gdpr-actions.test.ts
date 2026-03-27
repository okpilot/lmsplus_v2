import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockCollectUserData } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockCollectUserData: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/gdpr/collect-user-data', () => ({
  collectUserData: mockCollectUserData,
}))

// ---- Subject under test ---------------------------------------------------

import { exportMyData } from './gdpr-actions'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000001'

const MOCK_EXPORT_PAYLOAD = {
  exported_at: '2026-03-27T10:00:00.000Z',
  user: {
    id: USER_ID,
    email: 'student@example.com',
    full_name: 'Jane Smith',
    role: 'student',
    created_at: '2026-01-01T00:00:00Z',
    last_active_at: null,
  },
  quiz_sessions: [],
  quiz_answers: [],
  student_responses: [],
  fsrs_cards: [],
  flagged_questions: [],
  question_comments: [],
  user_consents: [],
  audit_events: [],
}

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: USER_ID } },
    error: null,
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('exportMyData', () => {
  describe('auth guard', () => {
    it('returns failure when auth returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      })

      const result = await exportMyData()

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })

    it('returns failure when no user is in the session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await exportMyData()

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('happy path', () => {
    it('returns the collected export payload on success', async () => {
      mockAuthenticatedUser()
      mockCollectUserData.mockResolvedValue(MOCK_EXPORT_PAYLOAD)

      const result = await exportMyData()

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.exported_at).toBe(MOCK_EXPORT_PAYLOAD.exported_at)
      expect(result.data.user.email).toBe('student@example.com')
    })

    it('delegates data collection to collectUserData with the authenticated user id', async () => {
      mockAuthenticatedUser()
      mockCollectUserData.mockResolvedValue(MOCK_EXPORT_PAYLOAD)

      await exportMyData()

      expect(mockCollectUserData).toHaveBeenCalledOnce()
      expect(mockCollectUserData).toHaveBeenCalledWith(expect.anything(), USER_ID)
    })
  })

  describe('error handling', () => {
    it('returns a sanitized error message when collectUserData throws', async () => {
      mockAuthenticatedUser()
      mockCollectUserData.mockRejectedValue(new Error('User not found'))

      const result = await exportMyData()

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to export data')
    })

    it('returns a sanitized error when an unexpected error object is thrown', async () => {
      mockAuthenticatedUser()
      mockCollectUserData.mockRejectedValue('unexpected string error')

      const result = await exportMyData()

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to export data')
    })
  })
})
