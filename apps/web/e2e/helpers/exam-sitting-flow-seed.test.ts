import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({
  getAdminClient: mockGetAdminClient,
  ADMIN_TEST_EMAIL: 'admin@lmsplus.local',
}))

import {
  adminIds,
  findSubject,
  readSittingCodes,
  restoreExamTimer,
  runCleanupSteps,
  seedEnrolledStudents,
  widenExamTimer,
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

beforeEach(async () => {
  vi.resetAllMocks()
  // `widenedTimers` is module state: an assertion that throws before a test's trailing restore
  // leaks an id into the next test. A zero-row restore drops it.
  fakeAdmin({})
  await restoreExamTimer().catch(() => {})
})

describe('findSubject', () => {
  it('returns the subject whose name matches the fragment', async () => {
    const calls = fakeAdmin({
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
    expect(calls).toContainEqual({
      table: 'easa_subjects',
      method: 'ilike',
      args: ['name', '%Meteo%'],
    })
    expect(calls).toContainEqual({
      table: 'easa_subjects',
      method: 'is',
      args: ['deleted_at', null],
    })
  })

  it.each([
    ['null', null],
    ['empty', ''],
  ])('refuses a subject whose short code is %s', async (_label, short) => {
    // `getByRole('checkbox', { name: `Add ${short}` })` substring-matches every "Add X" checkbox.
    fakeAdmin({
      easa_subjects: [
        { data: { id: 's1', short, name: 'Meteorology', course_id: 'c1' }, error: null },
      ],
    })
    await expect(findSubject('Meteo')).rejects.toThrow(
      'exam-sitting-flow-seed subject Meteo short (checkbox locators need it): no data',
    )
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
    expect(users).toHaveLength(2)
    expect(users.every((u) => u.email.startsWith('e2e-sit-'))).toBe(true)
  })

  it('names this helper in the error when the admin lookup fails', async () => {
    fakeAdmin({ users: [{ data: null, error: { message: 'no admin' } }] })
    await expect(seedEnrolledStudents(['Bea'], 'course-1')).rejects.toThrow(
      'exam-sitting-flow-seed admin lookup: no admin',
    )
  })
})

describe('adminIds', () => {
  it('looks the admin up by the shared admin email among live users', async () => {
    const calls = fakeAdmin({ users: [ADMIN_ROW] })
    await expect(adminIds(mockGetAdminClient())).resolves.toEqual({
      adminId: 'admin-1',
      orgId: 'org-1',
    })
    expect(calls).toContainEqual({
      table: 'users',
      method: 'eq',
      args: ['email', 'admin@lmsplus.local'],
    })
    expect(calls).toContainEqual({ table: 'users', method: 'is', args: ['deleted_at', null] })
  })
})

describe('readSittingCodes', () => {
  it('scopes the entries read and the codes read to the admin organisation', async () => {
    const calls = fakeAdmin({
      users: [ADMIN_ROW],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [], error: null }],
    })
    await readSittingCodes('s1')
    const org = ['organization_id', 'org-1']
    expect(calls).toContainEqual({ table: 'exam_sitting_entries', method: 'eq', args: org })
    expect(calls).toContainEqual({ table: 'internal_exam_codes', method: 'eq', args: org })
  })

  it('returns no codes for a sitting without entries', async () => {
    fakeAdmin({ users: [ADMIN_ROW], exam_sitting_entries: [{ data: [], error: null }] })
    await expect(readSittingCodes('s1')).resolves.toEqual([])
  })

  it('maps each code with its voided state and reason', async () => {
    fakeAdmin({
      users: [ADMIN_ROW],
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

describe('widenExamTimer / restoreExamTimer', () => {
  const cfg = (id: string, seconds: number): Result => ({
    data: { id, time_limit_seconds: seconds },
    error: null,
  })
  const updated = (id: string): Result => ({ data: [{ id }], error: null })

  it('scopes the config lookup to the admin organisation', async () => {
    // `start_internal_exam_session` resolves it with `ec.organization_id = v_org_id`, so an
    // unscoped lookup can widen another tenant's row and leave the exam on its own limit.
    const calls = fakeAdmin({
      users: [ADMIN_ROW, ADMIN_ROW],
      exam_configs: [cfg('cfg-1', 60), updated('cfg-1'), updated('cfg-1')],
    })
    await widenExamTimer('subj-1')
    expect(
      calls.filter((c) => c.table === 'exam_configs' && c.method === 'eq').map((c) => c.args),
    ).toContainEqual(['organization_id', 'org-1'])
    await restoreExamTimer()
  })

  it('scopes the widen update and the restore update to the admin organisation', async () => {
    const calls = fakeAdmin({
      users: [ADMIN_ROW, ADMIN_ROW],
      exam_configs: [cfg('cfg-1', 60), updated('cfg-1'), updated('cfg-1')],
    })
    await widenExamTimer('subj-1')
    await restoreExamTimer()
    const updateAt = calls
      .map((c, i) => (c.table === 'exam_configs' && c.method === 'update' ? i : -1))
      .filter((i) => i >= 0)
    expect(updateAt).toHaveLength(2)
    for (const i of updateAt) {
      const eqs = calls
        .slice(i + 1)
        .filter((c) => c.table === 'exam_configs')
        .slice(0, 2)
        .filter((c) => c.method === 'eq')
        .map((c) => c.args)
      expect(eqs).toContainEqual(['organization_id', 'org-1'])
    }
  })

  it('restores every config it widened, not only the last', async () => {
    const calls = fakeAdmin({
      users: [ADMIN_ROW, ADMIN_ROW, ADMIN_ROW],
      exam_configs: [
        cfg('cfg-1', 60),
        updated('cfg-1'),
        cfg('cfg-2', 90),
        updated('cfg-2'),
        updated('cfg-1'),
        updated('cfg-2'),
      ],
    })
    await widenExamTimer('subj-1')
    await widenExamTimer('subj-2')
    await restoreExamTimer()
    const restored = calls
      .filter((c) => c.table === 'exam_configs' && c.method === 'update')
      .map((c) => c.args[0])
    expect(restored).toContainEqual({ time_limit_seconds: 60 })
    expect(restored).toContainEqual({ time_limit_seconds: 90 })
  })

  it('leaves a config already at or above the target untouched', async () => {
    // The early return is what keeps a shared seed's own limit out of `widenedTimers`: recording
    // it would make the restore write a value this helper never changed.
    const calls = fakeAdmin({
      users: [ADMIN_ROW],
      exam_configs: [cfg('cfg-1', 3600)],
    })
    await widenExamTimer('subj-1', 3600)
    expect(calls.filter((c) => c.table === 'exam_configs' && c.method === 'update')).toEqual([])
    await restoreExamTimer()
    expect(calls.filter((c) => c.table === 'exam_configs' && c.method === 'update')).toEqual([])
  })

  it('restores the ORIGINAL limit after the same config is widened twice', async () => {
    // Without the `widenedTimers.has` guard the second widen records 120 — the value the first
    // call raised — and the restore puts back a widened timer instead of the seed's own 60.
    const calls = fakeAdmin({
      users: [ADMIN_ROW, ADMIN_ROW, ADMIN_ROW],
      exam_configs: [
        cfg('cfg-1', 60),
        updated('cfg-1'),
        cfg('cfg-1', 120),
        updated('cfg-1'),
        updated('cfg-1'),
      ],
    })
    await widenExamTimer('subj-1', 120)
    await widenExamTimer('subj-1', 3600)
    await restoreExamTimer()
    const updates = calls
      .filter((c) => c.table === 'exam_configs' && c.method === 'update')
      .map((c) => c.args[0])
    expect(updates.at(-1)).toEqual({ time_limit_seconds: 60 })
  })

  it('drops a config whose row is gone, so a later restore stops re-throwing', async () => {
    const calls = fakeAdmin({
      users: [ADMIN_ROW, ADMIN_ROW],
      exam_configs: [cfg('cfg-1', 60), updated('cfg-1'), { data: [], error: null }],
    })
    await widenExamTimer('subj-1')
    await expect(restoreExamTimer()).rejects.toThrow(
      'exam-sitting-flow-seed exam timer restore: restore: no row cfg-1',
    )
    const after = calls.length
    await expect(restoreExamTimer()).resolves.toBeUndefined()
    expect(calls.slice(after).filter((c) => c.table === 'exam_configs')).toEqual([])
  })

  it('touches no client when nothing was widened', async () => {
    const calls = fakeAdmin({})
    await restoreExamTimer()
    expect(calls.filter((c) => c.table === 'exam_configs')).toEqual([])
  })

  it('attempts every restore after one fails, then throws', async () => {
    const calls = fakeAdmin({
      users: [ADMIN_ROW, ADMIN_ROW, ADMIN_ROW, ADMIN_ROW],
      exam_configs: [
        cfg('cfg-1', 60),
        updated('cfg-1'),
        cfg('cfg-2', 90),
        updated('cfg-2'),
        { data: null, error: { message: 'boom' } },
        updated('cfg-2'),
        updated('cfg-1'),
      ],
    })
    await widenExamTimer('subj-1')
    await widenExamTimer('subj-2')
    const thrown = await restoreExamTimer().then(
      () => null,
      (e: unknown) => e,
    )
    const restored = calls
      .filter((c) => c.table === 'exam_configs' && c.method === 'update')
      .map((c) => c.args[0])
    expect(restored).toContainEqual({ time_limit_seconds: 90 })
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toBe(
      'exam-sitting-flow-seed exam timer restore: restore cfg-1: boom',
    )
    // cfg-1 stays in the map; the retry drains it (and only it) so the next test starts empty.
    const isTimerUpdate = (c: { table: string; method: string }) =>
      c.table === 'exam_configs' && c.method === 'update'
    const before = calls.filter(isTimerUpdate).length
    await restoreExamTimer()
    const drained = calls
      .filter(isTimerUpdate)
      .slice(before)
      .map((c) => c.args[0])
    expect(drained).toEqual([{ time_limit_seconds: 60 }])
    expect(drained).not.toContainEqual({ time_limit_seconds: 90 })
  })
})
