import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-stub'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-stub'
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))

import { createTestUser } from './setup'

const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockInsert = vi.fn()
const admin = {
  auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
  from: () => ({ insert: mockInsert }),
} as unknown as Parameters<typeof createTestUser>[0]['admin']

const opts = {
  admin,
  orgId: 'org-1',
  email: 'a@example.test',
  password: 'pw',
  role: 'student' as const,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })
})

describe('createTestUser', () => {
  it('returns the new user id without touching the auth user when both inserts succeed', async () => {
    mockInsert.mockResolvedValue({ error: null })

    await expect(createTestUser(opts)).resolves.toBe('auth-1')
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('removes the auth user and rethrows when the public.users insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'insert boom' } })
    mockDeleteUser.mockResolvedValue({ error: null })

    await expect(createTestUser(opts)).rejects.toThrow('createTestUser public: insert boom')
    expect(mockDeleteUser).toHaveBeenCalledTimes(1)
    expect(mockDeleteUser).toHaveBeenCalledWith('auth-1')
    expect(console.error).toHaveBeenCalledWith(
      '[createTestUser] public.users insert failed:',
      'insert boom',
    )
  })

  it('logs the orphaned auth user id when removing it also fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'insert boom' } })
    mockDeleteUser.mockResolvedValue({ error: { message: 'gotrue boom' } })

    await expect(createTestUser(opts)).rejects.toThrow('createTestUser public: insert boom')
    expect(console.error).toHaveBeenCalledWith(
      '[createTestUser] Rollback failed — orphaned auth user:',
      'auth-1',
      'gotrue boom',
    )
  })
})
