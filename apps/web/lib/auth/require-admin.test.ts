import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetClaims = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    auth: { getClaims: mockGetClaims, getUser: mockGetUser },
    from: mockFrom,
  }),
)

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireAdmin } from './require-admin'

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getClaims: mockGetClaims, getUser: mockGetUser },
      from: mockFrom,
    })
    mockRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })
  })

  it('returns supabase and userId for admin users', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', role: 'authenticated' } },
      error: null,
    })
    const isMock = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { role: 'admin', organization_id: 'org-1' },
        error: null,
      }),
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ is: isMock }),
      }),
    })

    const result = await requireAdmin()
    expect(result.userId).toBe('user-1')
    expect(result.organizationId).toBe('org-1')
    expect(result.supabase).toBeDefined()
    expect(mockRedirect).not.toHaveBeenCalled()
    // Asserted explicitly, not just accommodated by the chain mock: this filter
    // is the second check that a soft-deleted admin cannot mutate data now that
    // service-role callers bypass RLS entirely. Without this, dropping it would
    // surface only as an opaque "maybeSingle is not a function".
    expect(isMock).toHaveBeenCalledWith('deleted_at', null)
  })

  it('reads the profile of the user named by the session claims', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-42', role: 'authenticated' } },
      error: null,
    })
    const eqMock = vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { role: 'admin', organization_id: 'org-1' },
          error: null,
        }),
      }),
    })
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqMock }) })

    await requireAdmin()

    expect(eqMock).toHaveBeenCalledWith('id', 'user-42')
  })

  it('redirects to the login page when the session has no valid claims', async () => {
    mockGetClaims.mockResolvedValue({
      data: null,
      error: { message: 'No session' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects to the login page when there is no session', async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null })

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects to the login page when the token role is not authenticated', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', role: 'service_role' } },
      error: null,
    })

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('redirects an anonymous session to the login page', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', role: 'authenticated', is_anonymous: true } },
      error: null,
    })

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('verifies identity locally without a getUser network call', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', role: 'authenticated' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { role: 'admin', organization_id: 'org-1' },
              error: null,
            }),
          }),
        }),
      }),
    })

    await requireAdmin()

    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects to /app/dashboard when user is not admin', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-2', role: 'authenticated' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
          }),
        }),
      }),
    })

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/app/dashboard')
    expect(mockRedirect).toHaveBeenCalledWith('/app/dashboard')
  })

  it('redirects an authenticated user without an active profile to /app/dashboard', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-deleted', role: 'authenticated' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    })

    await expect(requireAdmin()).rejects.toThrow('NEXT_REDIRECT:/app/dashboard')
    expect(mockRedirect).toHaveBeenCalledWith('/app/dashboard')
  })

  it('throws a service error when the profile query fails', async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: 'user-3', role: 'authenticated' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({ data: null, error: { message: 'connection lost' } }),
          }),
        }),
      }),
    })

    await expect(requireAdmin()).rejects.toThrow('Service error: could not verify admin role')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
