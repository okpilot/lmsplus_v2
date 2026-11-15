import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin, mockFrom } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { getCourses, getStudentsPage } from './queries'

const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const COURSE_A = 'c0a5e000-0000-4000-8000-000000000001'
const COURSE_B = 'c0a5e000-0000-4000-8000-000000000002'

function buildChain(result: {
  data: unknown
  count?: number | null
  error: unknown
}): Record<string, unknown> {
  const chain: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
        return () => chain
      },
    },
  )
  return chain as Record<string, unknown>
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAdmin.mockResolvedValue({ organizationId: ORG_ID })
})

describe('getStudentsPage', () => {
  it('maps embedded course_enrolments to course_ids and drops the embed', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            id: 's1',
            email: 'a@x.com',
            course_enrolments: [{ course_id: COURSE_A }, { course_id: COURSE_B }],
            student_group_members: [],
          },
          { id: 's2', email: 'b@x.com', course_enrolments: [], student_group_members: [] },
        ],
        count: 2,
        error: null,
      }),
    )

    const { rows, totalCount } = await getStudentsPage({ page: 1 })

    expect(totalCount).toBe(2)
    expect(rows).toEqual([
      { id: 's1', email: 'a@x.com', course_ids: [COURSE_A, COURSE_B], group_ids: [] },
      { id: 's2', email: 'b@x.com', course_ids: [], group_ids: [] },
    ])
  })

  it('embeds enrolments through the course_enrolments_user_id_fkey hint', async () => {
    const select = vi.fn()
    const chain = buildChain({ data: [], count: 0, error: null }) as Record<string, unknown>
    mockFrom.mockReturnValue(
      new Proxy(chain, {
        get(t, prop) {
          if (prop === 'select')
            return (...a: unknown[]) => {
              select(...a)
              return t
            }
          return (t as Record<string | symbol, unknown>)[prop]
        },
      }),
    )

    await getStudentsPage({ page: 1 })

    const arg = String(select.mock.calls[0]?.[0])
    expect(arg).toContain('course_enrolments!course_enrolments_user_id_fkey(course_id)')
    expect(arg).not.toContain('student_id_fkey')
  })

  it('returns an empty page when no rows come back', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, count: 0, error: null }))
    expect(await getStudentsPage({ page: 1 })).toEqual({ rows: [], totalCount: 0 })
  })

  it('throws when the query fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getStudentsPage({ page: 1 })).rejects.toThrow('Failed to fetch students')
  })

  it('throws when a row lacks the membership arrays', async () => {
    mockFrom.mockReturnValue(buildChain({ data: [{ id: 'x' }], count: 1, error: null }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getStudentsPage({ page: 1 })).rejects.toThrow('Failed to fetch students')
  })

  it('returns the exact total with no rows when the page is past the end', async () => {
    mockFrom
      .mockReturnValueOnce(
        buildChain({ data: null, count: null, error: { code: 'PGRST103', message: 'range' } }),
      )
      .mockReturnValueOnce(buildChain({ data: null, count: 61, error: null }))
    const result = await getStudentsPage({ page: 9 })
    expect(result).toEqual({ rows: [], totalCount: 61 })
  })
})

describe('getCourses', () => {
  it('returns the course options', async () => {
    const courses = [{ id: COURSE_A, short: 'PPL', name: 'Private Pilot' }]
    mockFrom.mockReturnValue(buildChain({ data: courses, error: null }))
    expect(await getCourses()).toEqual(courses)
    expect(mockFrom).toHaveBeenCalledWith('courses')
  })

  it('throws when the query fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getCourses()).rejects.toThrow('Failed to fetch courses')
  })

  it('rejects when the caller is not an admin', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Forbidden'))
    await expect(getCourses()).rejects.toThrow('Forbidden')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
