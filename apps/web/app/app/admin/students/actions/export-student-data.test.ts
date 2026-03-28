import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRequireAdmin, mockFrom, mockCollectUserData } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockCollectUserData: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockFrom,
  },
}))

vi.mock('@/lib/gdpr/collect-user-data', () => ({
  collectUserData: mockCollectUserData,
}))

// ---- Subject under test ---------------------------------------------------

import { exportStudentData } from './export-student-data'

// ---- Helpers ---------------------------------------------------------------

const ADMIN_ID = 'aaaaaaaa-0000-4000-a000-000000000001'
const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const STUDENT_ID = 'cccccccc-0000-4000-a000-000000000003'

const MOCK_EXPORT_PAYLOAD = {
  exported_at: '2026-03-27T10:00:00.000Z',
  user: {
    id: STUDENT_ID,
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

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({ userId: ADMIN_ID, organizationId: ORG_ID })
}

function buildStudentLookupChain({
  data = { id: STUDENT_ID },
  error = null,
}: {
  data?: { id: string } | null
  error?: { code?: string; message: string } | null
} = {}) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('exportStudentData', () => {
  describe('input validation', () => {
    it('returns failure when input is missing userId', async () => {
      const result = await exportStudentData({})

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when userId is not a valid UUID', async () => {
      const result = await exportStudentData({ userId: 'not-a-uuid' })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when input is not an object', async () => {
      const result = await exportStudentData('some string')

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('org-scoped student lookup', () => {
    it('returns student-not-found when PGRST116 is returned', async () => {
      mockAdmin()
      buildStudentLookupChain({ data: null, error: { code: 'PGRST116', message: 'not found' } })

      const result = await exportStudentData({ userId: STUDENT_ID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
    })

    it('returns student-not-found when target belongs to a different org', async () => {
      mockAdmin()
      buildStudentLookupChain({ data: null, error: null })

      const result = await exportStudentData({ userId: STUDENT_ID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
    })

    it('returns student-not-found for a generic fetch error', async () => {
      mockAdmin()
      buildStudentLookupChain({
        data: null,
        error: { message: 'connection timeout' },
      })

      const result = await exportStudentData({ userId: STUDENT_ID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
    })
  })

  describe('happy path', () => {
    it('returns the collected export payload when student is in the same org', async () => {
      mockAdmin()
      buildStudentLookupChain()
      mockCollectUserData.mockResolvedValue(MOCK_EXPORT_PAYLOAD)

      const result = await exportStudentData({ userId: STUDENT_ID })

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.user.id).toBe(STUDENT_ID)
    })

    it('delegates data collection to collectUserData with the student id', async () => {
      mockAdmin()
      buildStudentLookupChain()
      mockCollectUserData.mockResolvedValue(MOCK_EXPORT_PAYLOAD)

      await exportStudentData({ userId: STUDENT_ID })

      expect(mockCollectUserData).toHaveBeenCalledOnce()
      expect(mockCollectUserData).toHaveBeenCalledWith(expect.anything(), STUDENT_ID)
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(exportStudentData({ userId: STUDENT_ID })).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })

  describe('export error handling', () => {
    it('returns a sanitized error message when collectUserData throws', async () => {
      mockAdmin()
      buildStudentLookupChain()
      mockCollectUserData.mockRejectedValue(new Error('DB unreachable'))

      const result = await exportStudentData({ userId: STUDENT_ID })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to export student data')
    })
  })
})
