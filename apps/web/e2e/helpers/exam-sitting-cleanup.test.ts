import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./admin-supabase', () => ({ ADMIN_TEST_EMAIL: 'admin@test.local' }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { POSTGREST_MAX_ROWS } from '../../lib/supabase-paginate'
import { cleanupE2eExamSittings, markE2eSitting } from './exam-sitting-cleanup'
import { EXAM_SITTING_E2E_PREFIX, EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'

type Call = { table: string; method: string; args: unknown[] }
type Result = { data: unknown; error: { message: string } | null }

function chain(result: Result, calls: Call[], table: string) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: makes the Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push({ table, method: String(prop), args })
        return chain(result, calls, table)
      }
    },
  })
}

function mockTables(queues: Record<string, Result[]>) {
  const calls: Call[] = []
  mockGetAdminClient.mockReturnValue({
    from: (t: string) => chain(queues[t]?.shift() ?? { data: [], error: null }, calls, t),
  })
  return calls
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('cleanupE2eExamSittings', () => {
  it('is a no-op when no marked sitting exists', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.filter((c) => c.method === 'delete' || c.method === 'update')).toHaveLength(0)
  })

  it('finds sittings by the E2E-SIT- materials marker', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    const like = calls.find((c) => c.method === 'like')
    expect(like?.args).toEqual(['permitted_materials', `${EXAM_SITTING_E2E_PREFIX}%`])
  })

  it('skips already-deleted sittings in the lookup', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null])
  })

  it('leaves marked sittings that have entries or candidates', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], error: null },
        { data: [{ id: 's3' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ sitting_id: 's1' }], error: null }],
      exam_sitting_candidates: [{ data: [{ sitting_id: 's2' }], error: null }],
      users: [{ data: { id: 'admin-1' }, error: null }],
    })
    await cleanupE2eExamSittings()
    const inCall = calls.filter((c) => c.table === 'exam_sittings' && c.method === 'in').at(-1)
    expect(inCall?.args).toEqual(['id', ['s3']])
  })

  it('never hard-deletes', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      users: [{ data: { id: 'admin-1' }, error: null }],
    })
    await cleanupE2eExamSittings()
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('soft-deletes open, not-yet-deleted sittings by id, stamped with the admin', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
      ],
      users: [{ data: { id: 'admin-1' }, error: null }],
    })
    await cleanupE2eExamSittings()
    const upIdx = calls.findIndex((c) => c.method === 'update')
    const up = calls[upIdx]
    expect(up?.table).toBe('exam_sittings')
    const patch = up?.args[0] as { deleted_at: string; deleted_by: string }
    expect(patch.deleted_by).toBe('admin-1')
    expect(Number.isNaN(Date.parse(patch.deleted_at))).toBe(false)
    const after = calls.slice(upIdx + 1)
    expect(after.find((c) => c.method === 'in')?.args).toEqual(['id', ['s1', 's2']])
    const isArgs = after.filter((c) => c.method === 'is').map((c) => c.args)
    expect(isArgs).toEqual([
      ['closed_at', null],
      ['deleted_at', null],
    ])
    expect(after.find((c) => c.method === 'select')?.args).toEqual(['id'])
  })

  it('logs the number of sittings actually soft-deleted', async () => {
    mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      users: [{ data: { id: 'admin-1' }, error: null }],
    })
    await cleanupE2eExamSittings()
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      'cleanupE2eExamSittings: soft-deleted 1 sitting(s)',
    )
  })

  it('stays silent when nothing is soft-deleted (e.g. all closed)', async () => {
    mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [], error: null },
      ],
      users: [{ data: { id: 'admin-1' }, error: null }],
    })
    await cleanupE2eExamSittings()
    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
  })

  it('throws when the soft-delete fails', async () => {
    mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }], error: null },
        { data: null, error: { message: 'fk block' } },
      ],
      users: [{ data: { id: 'admin-1' }, error: null }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/soft-delete: fk block/)
  })

  it('throws when the admin user cannot be resolved and updates nothing', async () => {
    const calls = mockTables({
      exam_sittings: [{ data: [{ id: 's1' }], error: null }],
      users: [{ data: null, error: { message: 'no admin' } }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/admin: no admin/)
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it.each(['exam_sitting_entries', 'exam_sitting_candidates'])(
    'throws when the %s lookup fails and updates nothing',
    async (table) => {
      const calls = mockTables({
        exam_sittings: [{ data: [{ id: 's1' }], error: null }],
        [table]: [{ data: null, error: { message: 'people boom' } }],
      })
      await expect(cleanupE2eExamSittings()).rejects.toThrow(new RegExp(`${table}: people boom`))
      expect(calls.some((c) => c.method === 'update')).toBe(false)
    },
  )

  it('throws when the lookup fails', async () => {
    mockTables({ exam_sittings: [{ data: null, error: { message: 'boom' } }] })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/boom/)
  })
})

describe('cleanupE2eExamSittings (seeded sittings)', () => {
  function seededClient(queues: Record<string, Result[]>) {
    const calls = mockTables(queues)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const base = mockGetAdminClient.getMockImplementation?.() ?? (() => ({}))
    const client = base() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return { calls, deleteUser }
  }

  it('deletes seeded entries, candidates and sittings by the E2E-SIT-SEED- marker', async () => {
    const { calls } = seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1', consumed_session_id: 'q1' }], error: null }],
      quiz_sessions: [
        { data: [{ id: 'q1', users: { email: 'e2e-sit-a@lmsplus.local' } }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const likes = calls.filter((c) => c.method === 'like').map((c) => c.args[1])
    expect(likes).toContain('E2E-SIT-SEED-%')
    const deleted = calls.filter((c) => c.method === 'delete').map((c) => c.table)
    expect(deleted).toEqual(
      expect.arrayContaining([
        'internal_exam_codes',
        'quiz_sessions',
        'exam_sitting_entries',
        'exam_sitting_candidates',
        'exam_sittings',
      ]),
    )
  })

  it("ends and soft-deletes a fixture student's session instead of deleting it", async () => {
    const { calls } = seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1', consumed_session_id: 'q1' }], error: null }],
      quiz_sessions: [
        { data: [{ id: 'q1', users: { email: 'e2e-internal-exam@lmsplus.local' } }], error: null },
        // The soft-delete UPDATE now chains `.select('id')` and checks the row count, so it draws a
        // second result: the row it updated.
        { data: [{ id: 'q1' }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const sessionCalls = calls.filter((c) => c.table === 'quiz_sessions')
    expect(sessionCalls.some((c) => c.method === 'delete')).toBe(false)
    const updates = sessionCalls.filter((c) => c.method === 'update').map((c) => c.args[0])
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ended_at: expect.any(String) }),
        expect.objectContaining({ deleted_at: expect.any(String) }),
      ]),
    )
  })

  it('throws when the fixture soft-delete updates fewer rows than it looked up', async () => {
    // A 0-row UPDATE returns 200 OK, so without the count check teardown would report success and
    // leave `ended_at IS NULL` — the next spec then fails with `active_session_exists`.
    seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1', consumed_session_id: 'q1' }], error: null }],
      quiz_sessions: [
        { data: [{ id: 'q1', users: { email: 'e2e-internal-exam@lmsplus.local' } }], error: null },
        { data: [], error: null },
      ],
    })
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toMatch(/fixture sessions soft-delete: expected 1 row\(s\), updated 0/)
  })

  it('throws, rather than guessing, when a session embed resolves no student', async () => {
    // Routed to the fixture branch a seeded row is only soft-deleted, and `deleteSeededUsers` then
    // fails on the `student_id` FK — a 23503 that buries this cause.
    const { calls } = seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1', consumed_session_id: 'q1' }], error: null }],
      quiz_sessions: [{ data: [{ id: 'q1', users: null }], error: null }],
    })
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toMatch(/no student for session q1/)
    const sessionCalls = calls.filter((c) => c.table === 'quiz_sessions')
    expect(sessionCalls.some((c) => c.method === 'delete' || c.method === 'update')).toBe(false)
  })

  it('reports the session lookup error and retires no session', async () => {
    const { calls } = seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1', consumed_session_id: 'q1' }], error: null }],
      quiz_sessions: [{ data: null, error: { message: 'sessions boom' } }],
    })
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toMatch(/seed sessions lookup/)
    expect(err?.message).toMatch(/sessions boom/)
    const sessionCalls = calls.filter((c) => c.table === 'quiz_sessions')
    expect(sessionCalls.some((c) => c.method === 'delete' || c.method === 'update')).toBe(false)
  })

  it('deletes the seeded students from users and auth', async () => {
    const { deleteUser } = seededClient({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: [{ id: 'u1' }, { id: 'u2' }], error: null }],
    })
    await cleanupE2eExamSittings()
    expect(deleteUser).toHaveBeenCalledWith('u1')
    expect(deleteUser).toHaveBeenCalledWith('u2')
  })
})

describe('cleanupE2eExamSittings (sessions found by student)', () => {
  function withAuth(queues: Record<string, Result[]>) {
    const calls = mockTables(queues)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return { calls, deleteUser }
  }

  it("deletes a seeded student's session that no code references, before the user", async () => {
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
      quiz_sessions: [
        { data: [{ id: 'q1' }], error: null },
        { data: [{ id: 'q1', users: { email: 'e2e-sit-a@lmsplus.local' } }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const byStudent = calls.find((c) => c.table === 'quiz_sessions' && c.method === 'in')
    expect(byStudent?.args).toEqual(['student_id', ['u1']])
    const sessionDelete = calls.findIndex(
      (c) => c.table === 'quiz_sessions' && c.method === 'delete',
    )
    const userDelete = calls.findIndex((c) => c.table === 'users' && c.method === 'delete')
    expect(sessionDelete).toBeGreaterThan(-1)
    expect(sessionDelete).toBeLessThan(userDelete)
  })

  it('queries no sessions when there are no seeded students', async () => {
    const { calls } = withAuth({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.some((c) => c.table === 'quiz_sessions')).toBe(false)
  })

  it('refuses a full session page instead of deleting a partial list', async () => {
    // A page of exactly `max_rows` is what real PostgREST returns when it truncates — the only
    // signal available, since a client `.limit()` cannot ask for more. Taking it would leave the
    // survivors pinning `quiz_sessions.student_id`, and the user delete would fail 23503 with the
    // cause gone.
    const { calls, deleteUser } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
      quiz_sessions: [
        {
          data: Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: `q${i}` })),
          error: null,
        },
      ],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow('max_rows')
    expect(calls.some((c) => c.table === 'quiz_sessions' && c.method === 'delete')).toBe(false)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('deletes a session page one row under the cap', async () => {
    // Pins the boundary: an off-by-one in the guard would refuse every ordinary teardown.
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
      quiz_sessions: [
        {
          data: Array.from({ length: POSTGREST_MAX_ROWS - 1 }, (_, i) => ({ id: `q${i}` })),
          error: null,
        },
      ],
    })
    await cleanupE2eExamSittings()
    expect(calls.some((c) => c.table === 'quiz_sessions' && c.method === 'delete')).toBe(true)
  })

  it('drops the codes consuming a seeded session before deleting the session', async () => {
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
      quiz_sessions: [{ data: [{ id: 'qs1' }], error: null }],
    })
    await cleanupE2eExamSittings()
    const codeDelete = calls.findIndex(
      (c) => c.table === 'internal_exam_codes' && c.method === 'delete',
    )
    const sessionDelete = calls.findIndex(
      (c) => c.table === 'quiz_sessions' && c.method === 'delete',
    )
    expect(codeDelete).toBeGreaterThan(-1)
    expect(codeDelete).toBeLessThan(sessionDelete)
    expect(calls.find((c) => c.table === 'internal_exam_codes' && c.method === 'in')?.args).toEqual(
      ['consumed_session_id', ['qs1']],
    )
  })

  it('leaves the seeded users alone when the session lookup fails, and reports it', async () => {
    const { deleteUser } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
      quiz_sessions: [{ data: null, error: { message: 'sessions boom' } }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/afterEach: .*sessions boom/)
    // `quiz_sessions.student_id` pins sessions before users: deleting the user anyway would raise
    // a 23503 per user and bury `sessions boom`.
    expect(deleteUser).not.toHaveBeenCalled()
  })
})

describe('cleanupE2eExamSittings (per-step isolation)', () => {
  it('still runs the seeded cleanup when the empty-sitting lookup fails', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const calls = mockTables({
      exam_sittings: [
        { data: null, error: { message: 'empty lookup boom' } },
        { data: [{ id: 's1' }], error: null },
      ],
      users: [{ data: [{ id: 'u1' }], error: null }],
    })
    const base = mockGetAdminClient.getMockImplementation?.()
    const client = (base ? base() : mockGetAdminClient()) as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/afterEach: .*lookup/)
    expect(calls.some((c) => c.table === 'exam_sittings' && c.method === 'delete')).toBe(true)
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('skips the seeded users when a seeded row delete fails, and says so', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const calls = mockTables({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: null, error: { message: 'entries boom' } }],
      users: [{ data: [{ id: 'u1' }], error: null }],
    })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    // FK ordering: deleting the users after a failed rows delete raises 23503 and buries the
    // cause (code-style.md § Multi-Step Cleanup, "Dependent steps"). The prefix-keyed users
    // lookup finds the leftovers again on the next run whose rows step succeeds.
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toMatch(/entries boom/)
    expect(err?.message).toMatch(/seed users delete skipped/)
    expect(deleteUser).not.toHaveBeenCalled()
    expect(
      calls.some(
        (c) => (c.table === 'users' || c.table === 'course_enrolments') && c.method === 'delete',
      ),
    ).toBe(false)
  })

  it('deletes later users when one user delete fails and reports the error', async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    mockTables({
      exam_sittings: [{ data: [], error: null }],
      users: [
        { data: [{ id: 'u1' }, { id: 'u2' }], error: null },
        { data: null, error: { message: 'u1 blocked' } },
      ],
    })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/afterEach: .*u1 blocked/)
    expect(deleteUser).toHaveBeenCalledWith('u2')
    expect(deleteUser).not.toHaveBeenCalledWith('u1')
  })
})

describe('cleanupE2eExamSittings (seeded groups)', () => {
  function withAuth(queues: Record<string, Result[]>) {
    const calls = mockTables(queues)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return { calls, deleteUser }
  }

  it('deletes the seeded groups and their members before the seeded users', async () => {
    const { calls, deleteUser } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      student_groups: [{ data: [{ id: 'g1' }], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
    })
    await cleanupE2eExamSittings()
    const like = calls.find((c) => c.table === 'student_groups' && c.method === 'like')
    expect(like?.args).toEqual(['name', 'E2E-GRP-SIT-%'])
    const membersDelete = calls.findIndex(
      (c) => c.table === 'student_group_members' && c.method === 'delete',
    )
    const groupsDelete = calls.findIndex(
      (c) => c.table === 'student_groups' && c.method === 'delete',
    )
    const usersDelete = calls.findIndex((c) => c.table === 'users' && c.method === 'delete')
    expect(membersDelete).toBeGreaterThan(-1)
    expect(membersDelete).toBeLessThan(groupsDelete)
    expect(groupsDelete).toBeLessThan(usersDelete)
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })

  it('deletes nothing from the group tables when no seeded group exists', async () => {
    const { calls } = withAuth({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.some((c) => c.table === 'student_group_members' && c.method === 'delete')).toBe(
      false,
    )
    expect(calls.some((c) => c.table === 'student_groups' && c.method === 'delete')).toBe(false)
  })

  it('still deletes the seeded users when the group delete fails, and reports the error', async () => {
    const { deleteUser } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      student_groups: [{ data: [{ id: 'g1' }], error: null }],
      student_group_members: [{ data: null, error: { message: 'members blocked' } }],
      users: [{ data: [{ id: 'u1' }], error: null }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/afterEach: .*members blocked/)
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })
})

describe('markE2eSitting', () => {
  it('writes the E2E-SIT- marker to the sitting id', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [{ id: 's1' }], error: null }] })
    await markE2eSitting('s1')
    const upd = calls.find((c) => c.method === 'update')
    const patch = (upd?.args[0] ?? {}) as { permitted_materials?: string }
    expect(patch.permitted_materials).toMatch(new RegExp(`^${EXAM_SITTING_E2E_PREFIX}`))
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['id', 's1'])
  })

  it('writes the E2E-SIT-SEED- marker when the sitting is marked as seeded', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [{ id: 's1' }], error: null }] })
    await markE2eSitting('s1', 'seeded')
    const patch = (calls.find((c) => c.method === 'update')?.args[0] ?? {}) as {
      permitted_materials?: string
    }
    expect(patch.permitted_materials).toMatch(new RegExp(`^${EXAM_SITTING_SEED_PREFIX}`))
  })

  it('throws on a database error', async () => {
    mockTables({ exam_sittings: [{ data: null, error: { message: 'boom' } }] })
    await expect(markE2eSitting('s1')).rejects.toThrow('markE2eSitting: boom')
  })

  it('throws when no row matched', async () => {
    mockTables({ exam_sittings: [{ data: [], error: null }] })
    await expect(markE2eSitting('s1')).rejects.toThrow('no sitting s1')
  })
})
