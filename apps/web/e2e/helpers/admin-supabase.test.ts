import { afterEach, describe, expect, it, vi } from 'vitest'

// Set required env vars before the module under test is evaluated
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

import { ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD, signInAsAdmin } from './admin-supabase'

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// signInAsAdmin
// ---------------------------------------------------------------------------

describe('signInAsAdmin', () => {
  it('creates the client with session persistence disabled', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await signInAsAdmin()

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    )
  })

  it('signs in with the admin email and password', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await signInAsAdmin()

    expect(signInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: ADMIN_TEST_EMAIL,
        password: ADMIN_TEST_PASSWORD,
      }),
    )
  })

  it('returns the authenticated client on success', async () => {
    const fakeClient = { auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } }
    mockCreateClient.mockReturnValue(fakeClient)

    const result = await signInAsAdmin()

    expect(result).toBe(fakeClient)
  })

  it('throws with the Supabase error message when sign-in fails', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: { message: 'Invalid credentials' } })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await expect(signInAsAdmin()).rejects.toThrow('signInAsAdmin: Invalid credentials')
  })

  it('uses the anon key (not service role key) for the client', async () => {
    const signInMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient.mockReturnValue({ auth: { signInWithPassword: signInMock } })

    await signInAsAdmin()

    // Second argument to createClient must be the anon key, not the service role key
    const [, secondArg] = mockCreateClient.mock.calls[0] as [unknown, string, unknown]
    expect(secondArg).toBe('test-anon-key')
  })
})
