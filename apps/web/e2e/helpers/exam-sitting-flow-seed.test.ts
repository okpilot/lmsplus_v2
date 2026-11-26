import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({ getAdminClient: mockGetAdminClient }))

import {
  findSubject,
  readSittingCodes,
  runCleanupSteps,
  seedEnrolledStudents,
  softDeleteEnrolment,
} from './exam-sitting-flow-seed'

type Call = { table: string; method: string; args: unknown[] }
type Result = { data: unknown; error: { message: string } | null }

/** A Supabase fake whose every chain resolves to the next queued result for its table. */
function fakeAdmin(queues: Record<string, Result[]>) {
  const calls: Call[] = []
  let n = 0
  const chain = (table: string, result: Result): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') {
            return (r: (v: unknown) => void) => Promise.resolve(result).then(r)
          }
          return (...args: unknown[]) => {
            calls.push({ table, method: String(prop), args })
            return chain(table, result)
          }
        },
      },
    )
  mockGetAdminClient.mockReturnValue({
    from: (t: string) => chain(t, queues[t]?.shift() ?? { data: [], error: null }),
    auth: {
      admin: { createUser: async () => ({ data: { user: { id: `u-${++n}` } }, error: null }) },
    },
  })
  return calls
}

const ADMIN_ROW: Result = { data: { id: 'admin-1', organization_id: 'org-1' }, error: null }

beforeEach(() => vi.resetAllMocks())

describe('findSubject', () => {
  it('returns the subject whose name matches the fragment', async () => {
    fakeAdmin({
      easa_subjects: [
        { data: { id: 's1', short: 'MET', name: 'Meteorology', course_id: 'c1' }, error: null },
      ],
    })
    await expect(findSubject('Meteo')).resolves.toEqual({
      id: 's1',
      short: 'MET',
      name: 'Meteorology',
      courseId: 'c1',
    })
  })

  it('throws when no subject matches', async () => {
    fakeAdmin({ easa_subjects: [{ data: null, error: { message: 'none' } }] })
    await expect(findSubject('Nope')).rejects.toThrow('subject Nope: none')
  })
})

describe('seedEnrolledStudents', () => {
  it('creates e2e-sit- students and enrols each in the course', async () => {
    const calls = fakeAdmin({
      users: [ADMIN_ROW],
      course_enrolments: [
        { data: null, error: null },
        { data: { id: 'en-1' }, error: null },
        { data: null, error: null },
        { data: { id: 'en-2' }, error: null },
      ],
    })
    const out = await seedEnrolledStudents(['Bea', 'Cy'], 'course-1')
    expect(out).toEqual([
      { name: 'Bea', userId: 'u-1' },
      { name: 'Cy', userId: 'u-2' },
    ])
    const inserts = calls.filter((c) => c.method === 'insert')
    const enrolled = inserts.filter((c) => c.table === 'course_enrolments').map((c) => c.args[0])
    expect(enrolled).toEqual([
      expect.objectContaining({ user_id: 'u-1', course_id: 'course-1', organization_id: 'org-1' }),
      expect.objectContaining({ user_id: 'u-2', course_id: 'course-1', organization_id: 'org-1' }),
    ])
    const users = inserts
      .filter((c) => c.table === 'users')
      .map((c) => c.args[0] as { email: string })
    expect(users.every((u) => u.email.startsWith('e2e-sit-'))).toBe(true)
  })

  it('names this helper in the error when the admin lookup fails', async () => {
    fakeAdmin({ users: [{ data: null, error: { message: 'no admin' } }] })
    await expect(seedEnrolledStudents(['Bea'], 'course-1')).rejects.toThrow(
      'exam-sitting-flow-seed admin lookup: no admin',
    )
  })
})

describe('softDeleteEnrolment', () => {
  it('does nothing for a null id', async () => {
    const calls = fakeAdmin({})
    await softDeleteEnrolment(null)
    expect(calls).toHaveLength(0)
  })

  it('soft-deletes the live row by id and never hard-deletes', async () => {
    const calls = fakeAdmin({ course_enrolments: [{ data: [{ id: 'en-1' }], error: null }] })
    await softDeleteEnrolment('en-1')
    const methods = calls.map((c) => c.method)
    expect(methods).not.toContain('delete')
    expect(calls.find((c) => c.method === 'update')?.args[0]).toHaveProperty('deleted_at')
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 'en-1'])
    expect(calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null])
  })

  it('throws when no live row matched', async () => {
    fakeAdmin({ course_enrolments: [{ data: [], error: null }] })
    await expect(softDeleteEnrolment('en-1')).rejects.toThrow('no enrolment en-1')
  })

  it('throws on a database error', async () => {
    fakeAdmin({ course_enrolments: [{ data: null, error: { message: 'boom' } }] })
    await expect(softDeleteEnrolment('en-1')).rejects.toThrow('enrolment soft-delete: boom')
  })
})

describe('readSittingCodes', () => {
  it('returns no codes for a sitting without entries', async () => {
    fakeAdmin({ exam_sitting_entries: [{ data: [], error: null }] })
    await expect(readSittingCodes('s1')).resolves.toEqual([])
  })

  it('maps each code with its voided state and reason', async () => {
    fakeAdmin({
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [
        {
          data: [
            { code: 'AAAA2222', student_id: 'u1', voided_at: null, void_reason: null },
            { code: 'BBBB3333', student_id: 'u2', voided_at: '2026-11-19', void_reason: 'absent' },
          ],
          error: null,
        },
      ],
    })
    await expect(readSittingCodes('s1')).resolves.toEqual([
      { code: 'AAAA2222', userId: 'u1', voided: false, voidReason: null },
      { code: 'BBBB3333', userId: 'u2', voided: true, voidReason: 'absent' },
    ])
  })
})

describe('runCleanupSteps', () => {
  it('runs every step and reports all failures together', async () => {
    const later = vi.fn().mockResolvedValue(undefined)
    await expect(
      runCleanupSteps([
        async () => {
          throw new Error('first')
        },
        later,
        async () => {
          throw new Error('third')
        },
      ]),
    ).rejects.toThrow('afterEach: first; third')
    expect(later).toHaveBeenCalled()
  })

  it('resolves when every step succeeds', async () => {
    await expect(runCleanupSteps([async () => {}])).resolves.toBeUndefined()
  })
})
