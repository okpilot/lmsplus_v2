import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin, mockFrom } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { getStudentsPage } from './queries'

const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const GROUP = 'a0000000-0000-4000-8000-000000000001'

function recorder(result: { data: unknown; count?: number; error: unknown }) {
  const calls: Array<[string, unknown[]]> = []
  const chain: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
        return (...args: unknown[]) => {
          calls.push([prop, args])
          return chain
        }
      },
    },
  )
  return { chain, calls }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ organizationId: ORG_ID })
})

describe('getStudentsPage', () => {
  it('returns rows with group_ids and the exact total count', async () => {
    const { chain } = recorder({
      data: [
        {
          id: 's1',
          course_enrolments: [],
          student_group_members: [{ group_id: GROUP }],
        },
      ],
      count: 61,
      error: null,
    })
    mockFrom.mockReturnValue(chain)

    const result = await getStudentsPage({ page: 1 })

    expect(result.totalCount).toBe(61)
    expect(result.rows[0]).toMatchObject({ id: 's1', group_ids: [GROUP], course_ids: [] })
    expect(result.rows[0]).not.toHaveProperty('student_group_members')
  })

  it('pages 25 per page ordered by created_at desc then id desc, scoped to the org', async () => {
    const { chain, calls } = recorder({ data: [], count: 0, error: null })
    mockFrom.mockReturnValue(chain)

    await getStudentsPage({ page: 3 })

    expect(calls).toContainEqual(['range', [50, 74]])
    expect(calls).toContainEqual(['order', ['created_at', { ascending: false }]])
    expect(calls).toContainEqual(['order', ['id', { ascending: false }]])
    expect(calls).toContainEqual(['eq', ['organization_id', ORG_ID]])
    const select = calls.find(([m]) => m === 'select')
    expect(select?.[1][1]).toMatchObject({ count: 'exact' })
    expect(String(select?.[1][0])).toContain(
      'student_group_members!student_group_members_user_id_fkey(group_id)',
    )
  })

  it('filters by group through a separate !inner embed that skips removed memberships', async () => {
    const { chain, calls } = recorder({ data: [], count: 0, error: null })
    mockFrom.mockReturnValue(chain)

    await getStudentsPage({ page: 1, group: GROUP })

    const select = String(calls.find(([m]) => m === 'select')?.[1][0])
    expect(select).toContain('student_group_members_user_id_fkey!inner(group_id)')
    expect(calls).toContainEqual(['eq', ['filter_members.group_id', GROUP]])
    expect(calls).toContainEqual(['is', ['filter_members.deleted_at', null]])
  })

  it('throws a generic error when the query fails', async () => {
    const { chain } = recorder({ data: null, error: { message: 'boom' } })
    mockFrom.mockReturnValue(chain)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getStudentsPage({ page: 1 })).rejects.toThrow('Failed to fetch students')
  })
})
