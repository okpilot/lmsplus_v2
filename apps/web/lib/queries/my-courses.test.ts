import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionUser, mockFrom, calls } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockFrom: vi.fn(),
  calls: [] as { method: string; args: unknown[] }[],
}))

vi.mock('@/lib/auth/get-session-user', () => ({ getSessionUser: () => mockGetSessionUser() }))
vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ from: mockFrom }),
}))

import { getMyCourses } from './my-courses'

function chain(result: unknown) {
  const target = {
    // biome-ignore lint/suspicious/noThenProperty: thenable Supabase chain mock
    then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      Promise.resolve(result).then(res, rej),
  }
  return new Proxy(target as Record<string, unknown>, {
    get(t, prop) {
      if (prop === 'then') return t.then
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return chain(result)
      }
    },
  })
}

const course = (code: string, short: string, sort_order: number) => ({
  courses: { id: `id-${code}`, code, short, name: `${code} name`, sort_order },
})

beforeEach(() => {
  vi.resetAllMocks()
  calls.length = 0
  mockGetSessionUser.mockResolvedValue({ id: 'u1' })
})

describe('getMyCourses', () => {
  it('returns the enrolled courses ordered by sort_order', async () => {
    mockFrom.mockReturnValue(
      chain({ data: [course('VFR_RT', 'RT', 2), course('PPL_A', 'PPL', 1)], error: null }),
    )
    const result = await getMyCourses()
    expect(result.map((c) => c.code)).toEqual(['PPL_A', 'VFR_RT'])
    expect(result[0]).toMatchObject({ id: 'id-PPL_A', short: 'PPL', name: 'PPL_A name' })
  })

  it('reads course_enrolments scoped to the session user and excludes soft-deleted rows', async () => {
    mockFrom.mockReturnValue(chain({ data: [], error: null }))
    await getMyCourses()
    expect(mockFrom).toHaveBeenCalledWith('course_enrolments')
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'u1'] })
    expect(calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
  })

  it('throws when the enrolment read returns no rows array', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }))
    await expect(getMyCourses()).rejects.toThrow('invalid response')
  })

  it('throws when the enrolment read errors', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    await expect(getMyCourses()).rejects.toThrow()
  })
})
