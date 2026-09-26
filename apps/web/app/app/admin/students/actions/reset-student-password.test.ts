import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockIssueTempPassword = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('./issue-temp-password', () => ({
  issueTempPassword: (...args: unknown[]) => mockIssueTempPassword(...args),
}))
vi.mock('@repo/db/admin', () => ({
  adminClient: { from: mockFrom },
}))

// ---- Subject under test ------------------------------------------------------

import { resetStudentPassword } from './reset-student-password'

// ---- Helpers ------------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'
const PRIOR_EXPIRY = '2026-09-20T00:00:00.000Z'

const VALID_INPUT = {
  id: VALID_UUID,
  temporary_password: 'NewPass1',
}

function mockAdmin() {
  mockRpc.mockResolvedValue({ error: null })
  mockRequireAdmin.mockResolvedValue({
    supabase: { rpc: mockRpc },
    userId: 'admin-1',
    organizationId: 'org-1',
  })
}

function buildFetchChain({
  fetchError = null,
  found = true,
  priorExpiresAt = PRIOR_EXPIRY,
}: {
  fetchError?: { message: string; code?: string } | null
  found?: boolean
  priorExpiresAt?: string | null
} = {}) {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data:
                fetchError || !found
                  ? null
                  : { id: VALID_UUID, temp_password_expires_at: priorExpiresAt },
              error: fetchError,
            }),
          }),
        }),
      }),
    }),
  })
}

// ---- Tests --------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockIssueTempPassword.mockResolvedValue('issued')
})

describe('resetStudentPassword', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await resetStudentPassword({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when id is not a valid UUID', async () => {
      const result = await resetStudentPassword({ ...VALID_INPUT, id: 'not-a-uuid' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when temporary_password is shorter than 6 characters', async () => {
      const result = await resetStudentPassword({ ...VALID_INPUT, temporary_password: 'abc' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('happy path — issueTempPassword resolves issued', () => {
    it('resets the password and revalidates on success', async () => {
      mockAdmin()
      buildFetchChain()

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockIssueTempPassword).toHaveBeenCalledWith({
        userId: VALID_UUID,
        organizationId: 'org-1',
        password: VALID_INPUT.temporary_password,
        priorExpiresAt: PRIOR_EXPIRY,
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    })

    it('records a user.password_reset audit event for the target student', async () => {
      mockAdmin()
      buildFetchChain()

      await resetStudentPassword(VALID_INPUT)

      expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
        p_event_type: 'user.password_reset',
        p_resource_id: VALID_UUID,
      })
    })

    it('still succeeds when the audit event write fails (best-effort)', async () => {
      mockAdmin()
      buildFetchChain()
      mockRpc.mockResolvedValue({ error: { message: 'audit insert failed' } })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[resetStudentPassword] Audit event failed:',
        'audit insert failed',
      )
      consoleSpy.mockRestore()
    })
  })

  describe('student lookup', () => {
    it('returns failure when student is not found (PGRST116)', async () => {
      mockAdmin()
      buildFetchChain({ fetchError: { message: 'no rows', code: 'PGRST116' } })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
      expect(mockIssueTempPassword).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a generic failure when fetching the student fails with a non-404 error', async () => {
      mockAdmin()
      buildFetchChain({ fetchError: { message: 'connection reset', code: 'PGRST500' } })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to reset password')
      expect(mockIssueTempPassword).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns failure when the fetched student data is null without an error', async () => {
      mockAdmin()
      buildFetchChain({ found: false })

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Student not found')
      expect(mockIssueTempPassword).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('issueTempPassword resolves failed', () => {
    it('returns a generic failure, does not audit, and does not revalidate', async () => {
      mockAdmin()
      buildFetchChain()
      mockIssueTempPassword.mockResolvedValue('failed')

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to reset password')
      expect(mockRpc).not.toHaveBeenCalled()
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('issueTempPassword resolves issued_not_armed', () => {
    it('audits the password change but tells the admin to reset again, and does not revalidate', async () => {
      mockAdmin()
      buildFetchChain()
      mockIssueTempPassword.mockResolvedValue('issued_not_armed')

      const result = await resetStudentPassword(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Password was changed but not marked temporary. Reset it again.')
      expect(mockRpc).toHaveBeenCalledWith('record_auth_event', {
        p_event_type: 'user.password_reset',
        p_resource_id: VALID_UUID,
      })
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(resetStudentPassword(VALID_INPUT)).rejects.toThrow(
        'Forbidden: admin role required',
      )
    })
  })
})
