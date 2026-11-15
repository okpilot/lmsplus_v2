import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockRequireAdmin } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRequireAdmin: vi.fn(),
}))

vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))
vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))

import { getGroupsWithCounts } from './queries'

function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

const G = (id: string, name: string) => ({
  id,
  name,
  description: null,
  created_at: '2026-03-01T00:00:00Z',
})

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ organizationId: 'org-1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getGroupsWithCounts', () => {
  it('attaches the active member count to each group', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'student_groups'
        ? buildChain({ data: [G('g1', 'A'), G('g2', 'B')], error: null })
        : buildChain({ count: 4, error: null }),
    )
    const rows = await getGroupsWithCounts()
    expect(rows.map((r) => [r.id, r.member_count])).toEqual([
      ['g1', 4],
      ['g2', 4],
    ])
  })

  it('returns an empty list when the org has no groups', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [], error: null }))
    expect(await getGroupsWithCounts()).toEqual([])
  })

  it('treats a null count as zero members', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'student_groups'
        ? buildChain({ data: [G('g1', 'A')], error: null })
        : buildChain({ count: null, error: null }),
    )
    expect((await getGroupsWithCounts())[0]?.member_count).toBe(0)
  })

  it('throws when the groups query fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'db' } }))
    await expect(getGroupsWithCounts()).rejects.toThrow('Failed to fetch groups')
  })

  it('throws when a member count query fails', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'student_groups'
        ? buildChain({ data: [G('g1', 'A')], error: null })
        : buildChain({ count: null, error: { message: 'db' } }),
    )
    await expect(getGroupsWithCounts()).rejects.toThrow('Failed to fetch groups')
  })
})
