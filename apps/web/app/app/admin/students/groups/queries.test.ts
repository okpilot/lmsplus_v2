import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockFrom, mockAdminFrom, mockRequireAdmin } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockAdminFrom } }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { getGroupsWithCounts } from './queries'

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ supabase: { rpc: mockRpc, from: mockFrom } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getGroupsWithCounts', () => {
  it('returns RPC rows with active and deactivated counts, keeping a null description', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'g1',
          name: 'A',
          description: null,
          created_at: '2026-03-01T00:00:00Z',
          active_count: 4,
          deactivated_count: 2,
        },
        {
          id: 'g2',
          name: 'B',
          description: 'desc',
          created_at: '2026-03-02T00:00:00Z',
          active_count: 0,
          deactivated_count: 1,
        },
      ],
      error: null,
    })
    const rows = await getGroupsWithCounts()
    expect(mockRpc).toHaveBeenCalledWith('get_student_groups_with_counts')
    expect(rows).toEqual([
      {
        id: 'g1',
        name: 'A',
        description: null,
        created_at: '2026-03-01T00:00:00Z',
        active_count: 4,
        deactivated_count: 2,
      },
      {
        id: 'g2',
        name: 'B',
        description: 'desc',
        created_at: '2026-03-02T00:00:00Z',
        active_count: 0,
        deactivated_count: 1,
      },
    ])
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockAdminFrom).not.toHaveBeenCalled()
  })

  it('returns an empty list when the org has no groups', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    expect(await getGroupsWithCounts()).toEqual([])
  })

  it.each(['not_authenticated', 'not_admin', 'admin_not_found', 'connection reset'])(
    'throws the generic message without leaking the RPC error "%s"',
    async (token) => {
      mockRpc.mockResolvedValue({ data: null, error: { message: token } })
      const err = await getGroupsWithCounts().then(
        () => null,
        (e: Error) => e,
      )
      expect(err?.message).toBe('Failed to fetch groups')
      expect(err?.message).not.toContain(token)
    },
  )
})
