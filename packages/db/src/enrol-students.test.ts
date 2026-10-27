import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enrolStudent, GRANDFATHER_COURSE_IDS } from './enrol-students'

type Result = { data?: unknown; error?: { message: string } | null }

const insert = vi.fn()
const results: Record<string, Result> = {}

function chain(result: Result): unknown {
  const target = () => undefined
  return new Proxy(target, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: (v: Result) => unknown) => res(result)
      return () => chain(result)
    },
  })
}

const admin = {
  from: (table: string) => ({
    select: () => chain(results[table] ?? { data: [], error: null }),
    insert: (rows: unknown) => insert(table, rows),
  }),
} as unknown as SupabaseClient

const USER = 'u1'

beforeEach(() => {
  vi.resetAllMocks()
  for (const k of Object.keys(results)) delete results[k]
  insert.mockResolvedValue({ error: null })
})

describe('enrolStudent', () => {
  it('inserts an enrolment per grandfather course for the given org', async () => {
    await enrolStudent(admin, { userId: USER, orgId: 'o1' })
    expect(insert).toHaveBeenCalledTimes(GRANDFATHER_COURSE_IDS.length)
    for (const course_id of GRANDFATHER_COURSE_IDS) {
      expect(insert).toHaveBeenCalledWith('course_enrolments', {
        organization_id: 'o1',
        user_id: USER,
        course_id,
      })
    }
  })

  it('still inserts the other course when one insert hits 23505', async () => {
    insert
      .mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })
      .mockResolvedValueOnce({ error: null })
    await enrolStudent(admin, { userId: USER, orgId: 'o1' })
    expect(insert).toHaveBeenNthCalledWith(2, 'course_enrolments', {
      organization_id: 'o1',
      user_id: USER,
      course_id: GRANDFATHER_COURSE_IDS[1],
    })
  })

  it('treats a concurrent duplicate insert (23505) as enrolled', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    await expect(enrolStudent(admin, { userId: USER, orgId: 'o1' })).resolves.toBeUndefined()
  })

  it('throws on any other insert error', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'denied' } })
    await expect(enrolStudent(admin, { userId: USER, orgId: 'o1' })).rejects.toThrow(
      'enrolStudent insert: denied',
    )
  })

  it('inserts only the courses with no active enrolment', async () => {
    results.course_enrolments = { data: [{ course_id: GRANDFATHER_COURSE_IDS[0] }], error: null }
    await enrolStudent(admin, { userId: USER, orgId: 'o1' })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith('course_enrolments', {
      organization_id: 'o1',
      user_id: USER,
      course_id: GRANDFATHER_COURSE_IDS[1],
    })
  })

  it('does not insert when every course is already enrolled', async () => {
    results.course_enrolments = {
      data: GRANDFATHER_COURSE_IDS.map((course_id) => ({ course_id })),
      error: null,
    }
    await enrolStudent(admin, { userId: USER, orgId: 'o1' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('does nothing for an empty course list', async () => {
    await enrolStudent(admin, { userId: USER, orgId: 'o1', courseIds: [] })
    expect(insert).not.toHaveBeenCalled()
  })

  it("looks up the user's organisation when orgId is omitted", async () => {
    results.users = { data: { organization_id: 'org-from-db' }, error: null }
    await enrolStudent(admin, { userId: USER, courseIds: ['c1'] })
    expect(insert).toHaveBeenCalledWith('course_enrolments', {
      organization_id: 'org-from-db',
      user_id: USER,
      course_id: 'c1',
    })
  })

  it('throws when the organisation lookup fails', async () => {
    results.users = { data: null, error: { message: 'boom' } }
    await expect(enrolStudent(admin, { userId: USER })).rejects.toThrow('enrolStudent org lookup')
  })

  it('throws when the probe fails', async () => {
    results.course_enrolments = { data: null, error: { message: 'nope' } }
    await expect(enrolStudent(admin, { userId: USER, orgId: 'o1' })).rejects.toThrow(
      'enrolStudent probe: nope',
    )
  })

  it('throws when the insert fails', async () => {
    insert.mockResolvedValue({ error: { message: 'dup' } })
    await expect(enrolStudent(admin, { userId: USER, orgId: 'o1' })).rejects.toThrow(
      'enrolStudent insert: dup',
    )
  })
})
