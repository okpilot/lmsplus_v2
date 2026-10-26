import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRequireAdmin, mockFrom } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/auth/require-admin', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@repo/db/admin', () => ({ adminClient: { from: mockFrom } }))

import { getCourses, getStudentsList } from './queries'

const ORG_ID = 'bbbbbbbb-0000-4000-a000-000000000002'
const COURSE_A = 'c0a5e000-0000-4000-8000-000000000001'
const COURSE_B = 'c0a5e000-0000-4000-8000-000000000002'

function buildChain(result: { data: unknown; error: unknown }): Record<string, unknown> {
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

describe('getStudentsList', () => {
  it('maps embedded course_enrolments to course_ids and drops the embed', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: [
          {
            id: 's1',
            email: 'a@x.com',
            course_enrolments: [{ course_id: COURSE_A }, { course_id: COURSE_B }],
          },
          { id: 's2', email: 'b@x.com', course_enrolments: [] },
        ],
        error: null,
      }),
    )

    const rows = await getStudentsList({})

    expect(rows).toEqual([
      { id: 's1', email: 'a@x.com', course_ids: [COURSE_A, COURSE_B] },
      { id: 's2', email: 'b@x.com', course_ids: [] },
    ])
  })

  it('embeds enrolments through the course_enrolments_user_id_fkey hint', async () => {
    const select = vi.fn()
    const chain = buildChain({ data: [], error: null }) as Record<string, unknown>
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

    await getStudentsList({})

    const arg = String(select.mock.calls[0]?.[0])
    expect(arg).toContain('course_enrolments!course_enrolments_user_id_fkey(course_id)')
    expect(arg).not.toContain('student_id_fkey')
  })

  it('returns an empty list when no rows come back', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    expect(await getStudentsList({})).toEqual([])
  })

  it('throws when the query fails', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getStudentsList({})).rejects.toThrow('Failed to fetch students')
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
