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

type Filter = { method: string; args: unknown[] }

/** Chain that records every call and resolves via `resolveValue(filters)`. */
function buildRecordingChain(
  resolveValue: (filters: Filter[]) => unknown,
  filters: Filter[] = [],
): unknown {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(resolveValue(filters)).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) =>
        buildRecordingChain(resolveValue, [...filters, { method: String(prop), args }])
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
  it('attaches each group its own active member count, scoped by organisation and group', async () => {
    const countFilters: Filter[][] = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'student_groups') {
        return buildChain({ data: [G('g1', 'A'), G('g2', 'B')], error: null })
      }
      return buildRecordingChain((filters) => {
        countFilters.push(filters)
        const groupId = filters.find((f) => f.method === 'eq' && f.args[0] === 'group_id')?.args[1]
        return { count: groupId === 'g1' ? 4 : 7, error: null }
      })
    })
    const rows = await getGroupsWithCounts()
    expect(rows.map((r) => [r.id, r.member_count])).toEqual([
      ['g1', 4],
      ['g2', 7],
    ])
    expect(countFilters).toHaveLength(2)
    for (const [i, groupId] of ['g1', 'g2'].entries()) {
      const eqs = countFilters[i]?.filter((f) => f.method === 'eq').map((f) => f.args)
      expect(eqs).toContainEqual(['organization_id', 'org-1'])
      expect(eqs).toContainEqual(['group_id', groupId])
    }
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
