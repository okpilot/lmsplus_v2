import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const mockRevalidatePath = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockCreateUser = vi.hoisted(() => vi.fn())
const mockDeleteUser = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({
  adminClient: {
    from: mockFrom,
    auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
  },
}))

// ---- Subject under test ---------------------------------------------------

import { createStudent } from './create-student'

// ---- Helpers ---------------------------------------------------------------

const ADMIN_ID = '00000000-0000-4000-a000-000000000001'
const ORG_ID = '00000000-0000-4000-a000-000000000002'
const NEW_USER_ID = '00000000-0000-4000-a000-000000000003'

const VALID_INPUT = {
  email: 'student@example.com',
  full_name: 'Jane Smith',
  role: 'student' as const,
  temporary_password: 'TempPass1',
}

function mockAdmin() {
  mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: ADMIN_ID, organizationId: ORG_ID })
}

function buildChain({ insertError = null }: { insertError?: { message: string } | null } = {}) {
  mockFrom.mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: insertError }),
  })
}

function mockAuthCreateUser({ error = null }: { error?: { message: string } | null } = {}) {
  mockCreateUser.mockResolvedValue({
    data: error ? null : { user: { id: NEW_USER_ID } },
    error,
  })
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createStudent', () => {
  describe('input validation', () => {
    it('returns failure when input is missing required fields', async () => {
      const result = await createStudent({})
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when email is invalid', async () => {
      const result = await createStudent({ ...VALID_INPUT, email: 'not-an-email' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when temporary_password is shorter than 6 characters', async () => {
      const result = await createStudent({ ...VALID_INPUT, temporary_password: 'abc' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when role is not a valid enum value', async () => {
      const result = await createStudent({ ...VALID_INPUT, role: 'superadmin' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })

    it('returns failure when full_name is empty', async () => {
      const result = await createStudent({ ...VALID_INPUT, full_name: '   ' })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Invalid input')
    })
  })

  describe('happy path', () => {
    it('creates the student and revalidates on success', async () => {
      mockAdmin()
      buildChain()
      mockAuthCreateUser()

      const result = await createStudent(VALID_INPUT)

      expect(result.success).toBe(true)
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: VALID_INPUT.email, email_confirm: true }),
      )
      expect(mockFrom).toHaveBeenCalledWith('users')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/admin/students')
    })

    it('sets must_change_password metadata when creating the auth user', async () => {
      mockAdmin()
      buildChain()
      mockAuthCreateUser()

      await createStudent(VALID_INPUT)

      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ user_metadata: { must_change_password: true } }),
      )
    })
  })

  describe('auth user creation', () => {
    it('returns a duplicate-email message when the email is already registered', async () => {
      mockAdmin()
      buildChain()
      mockAuthCreateUser({ error: { message: 'Email already registered' } })

      const result = await createStudent(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('A user with this email already exists')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })

    it('returns a generic failure when auth user creation fails for other reasons', async () => {
      mockAdmin()
      buildChain()
      mockAuthCreateUser({ error: { message: 'service unavailable' } })

      const result = await createStudent(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to create student')
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('profile insert', () => {
    it('deletes the auth user and returns failure when profile insert fails', async () => {
      mockAdmin()
      buildChain({ insertError: { message: 'unique constraint' } })
      mockAuthCreateUser()
      mockDeleteUser.mockResolvedValue({ error: null })

      const result = await createStudent(VALID_INPUT)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to create student')
      expect(mockDeleteUser).toHaveBeenCalledWith(NEW_USER_ID)
      expect(mockRevalidatePath).not.toHaveBeenCalled()
    })
  })

  describe('auth guard', () => {
    it('propagates the error when requireAdmin throws', async () => {
      mockRequireAdmin.mockRejectedValue(new Error('Forbidden: admin role required'))

      await expect(createStudent(VALID_INPUT)).rejects.toThrow('Forbidden: admin role required')
    })
  })
})
