import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
)

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

import { requireAdmin } from './require-admin'

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  })

  it('returns supabase and userId for admin users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { role: 'admin', organization_id: 'org-1' }, error: null }),
        }),
      }),
    })

    const result = await requireAdmin()
    expect(result.userId).toBe('user-1')
    expect(result.organizationId).toBe('org-1')
    expect(result.supabase).toBeDefined()
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    })

    await expect(requireAdmin()).rejects.toThrow('Not authenticated')
  })

  it('throws when user has no session', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    await expect(requireAdmin()).rejects.toThrow('Not authenticated')
  })

  it('throws when user is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { role: 'student' }, error: null }),
        }),
      }),
    })

    await expect(requireAdmin()).rejects.toThrow('Forbidden: admin role required')
  })

  it('throws a service error when the profile query fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-3' } },
      error: null,
    })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'connection lost' } }),
        }),
      }),
    })

    await expect(requireAdmin()).rejects.toThrow('Service error: could not verify admin role')
  })
})
