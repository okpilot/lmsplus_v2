import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRedirect = vi.hoisted(() => vi.fn())
const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import AdminIndexPage from './page'

describe('AdminIndexPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('sends an admin at the bare admin path to the admin dashboard', async () => {
    mockRequireAdmin.mockResolvedValue({
      supabase: {},
      userId: 'admin-1',
      organizationId: 'org-1',
    })

    await AdminIndexPage()

    expect(mockRedirect).toHaveBeenCalledWith('/app/admin/dashboard')
  })

  it('does not redirect when the caller fails the admin check', async () => {
    // Asserts the gate runs BEFORE the redirect, not merely that it is present —
    // otherwise the guard could be dropped and the page would still look green.
    mockRequireAdmin.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/app/dashboard'))

    await expect(AdminIndexPage()).rejects.toThrow('NEXT_REDIRECT:/app/dashboard')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
