import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAdmin = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import AdminLayout from './layout'

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders its children for an admin', async () => {
    mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1', organizationId: 'org-1' })
    const children = 'admin-content'

    await expect(AdminLayout({ children })).resolves.toBe(children)
  })

  it('does not render children when the caller fails the admin check', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/app/dashboard'))

    await expect(AdminLayout({ children: 'admin-content' })).rejects.toThrow(
      'NEXT_REDIRECT:/app/dashboard',
    )
  })

  it('propagates a service error from the admin check', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Service error: could not verify admin role'))

    await expect(AdminLayout({ children: 'admin-content' })).rejects.toThrow(
      'Service error: could not verify admin role',
    )
  })
})
