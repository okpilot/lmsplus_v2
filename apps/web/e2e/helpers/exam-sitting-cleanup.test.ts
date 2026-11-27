import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
// The real lookup reads `users` and would consume the first entry of every `users` queue.
vi.mock('./exam-sitting-flow-seed', () => ({
  adminIds: vi.fn(async () => ({ adminId: 'admin-7', orgId: 'org-7' })),
}))

import { POSTGREST_MAX_ROWS } from '../../lib/supabase-paginate'
import { cleanupE2eExamSittings, markE2eSitting } from './exam-sitting-cleanup'
import { adminIds } from './exam-sitting-flow-seed'
import { EXAM_SITTING_E2E_PREFIX, EXAM_SITTING_SEED_PREFIX } from './exam-sitting-markers'

// Mirrors `ID_CHUNK` in exam-sitting-cleanup.ts: the byte budget of one PostgREST request line.
const ID_CHUNK = 100

type Call = { table: string; method: string; args: unknown[]; seq: number }
type Result = { data: unknown; error: { message: string } | null }

function chain(result: Result, calls: Call[], table: string, seq: number) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: makes the Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push({ table, method: String(prop), args, seq })
        return chain(result, calls, table, seq)
      }
    },
  })
}

function mockTables(queues: Record<string, Result[]>) {
  const calls: Call[] = []
  let seq = 0
  mockGetAdminClient.mockReturnValue({
    from: (t: string) => chain(queues[t]?.shift() ?? { data: [], error: null }, calls, t, seq++),
  })
  return calls
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('cleanupE2eExamSittings', () => {
  it('is a no-op when no marked sitting exists', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.filter((c) => c.method === 'delete' || c.method === 'update')).toHaveLength(0)
    expect(
      calls.some(
        (c) =>
          c.table === 'exam_sittings' &&
          c.method === 'like' &&
          c.args[1] === `${EXAM_SITTING_E2E_PREFIX}%`,
      ),
    ).toBe(true)
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

  it('skips closed sittings in the lookup', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    const sittingCalls = calls.filter((c) => c.table === 'exam_sittings')
    expect(sittingCalls.find((c) => c.method === 'like')?.args).toEqual([
      'permitted_materials',
      `${EXAM_SITTING_E2E_PREFIX}%`,
    ])
    expect(sittingCalls.filter((c) => c.method === 'is').map((c) => c.args)).toContainEqual([
      'closed_at',
      null,
    ])
  })

  it('leaves marked sittings that have live entries or candidates', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], error: null },
        { data: [{ id: 's3' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ sitting_id: 's1' }], error: null }],
      exam_sitting_candidates: [{ data: [{ sitting_id: 's2' }], error: null }],
    })
    await cleanupE2eExamSittings()
    const inCall = calls.filter((c) => c.table === 'exam_sittings' && c.method === 'in').at(-1)
    expect(inCall?.args).toEqual(['id', ['s3']])
  })

  it.each(['exam_sitting_entries', 'exam_sitting_candidates'])(
    'treats a sitting whose %s rows are all soft-deleted as empty',
    async (table) => {
      // Soft-deleted rows counted as people make a sitting immortal, up to `max_rows`.
      const calls = mockTables({
        exam_sittings: [
          { data: [{ id: 's1' }], error: null },
          { data: [{ id: 's1' }], error: null },
        ],
      })
      await cleanupE2eExamSittings()
      const peopleCalls = calls.filter((c) => c.table === table)
      expect(peopleCalls.find((c) => c.method === 'in')?.args).toEqual(['sitting_id', ['s1']])
      expect(peopleCalls.filter((c) => c.method === 'is').map((c) => c.args)).toContainEqual([
        'deleted_at',
        null,
      ])
    },
  )

  it('never hard-deletes', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
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
    })
    await cleanupE2eExamSittings()
    const upIdx = calls.findIndex((c) => c.method === 'update')
    const up = calls[upIdx]
    expect(up?.table).toBe('exam_sittings')
    const patch = up?.args[0] as { deleted_at: string; deleted_by: string }
    expect(patch.deleted_by).toBe('admin-7')
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
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/soft-delete: fk block/)
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
        'exam_sitting_entries',
        'exam_sitting_candidates',
        'exam_sittings',
      ]),
    )
    // The per-sitting pass deletes no session: `deleteSeededStudentSessions` does, after every sitting.
    expect(deleted).not.toContain('quiz_sessions')
  })

  it('scopes the seeded-sittings lookup and the seeded-row deletes to the organization', async () => {
    const { calls } = seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const orgScoped = (table: string, method: string) =>
      calls.some(
        (c) =>
          c.table === table &&
          c.method === 'eq' &&
          c.args[0] === 'organization_id' &&
          c.args[1] === 'org-7',
      ) && calls.some((c) => c.table === table && c.method === method)
    const sittingsLookup = calls.findIndex(
      (c) => c.table === 'exam_sittings' && c.method === 'like' && c.args[1] === 'E2E-SIT-SEED-%',
    )
    const lookupOrg = calls
      .slice(0, sittingsLookup)
      .reverse()
      .find((c) => c.table === 'exam_sittings' && c.method === 'eq')
    expect(lookupOrg?.args).toEqual(['organization_id', 'org-7'])
    expect(orgScoped('exam_sitting_entries', 'delete')).toBe(true)
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

  it('throws, deleting no code, when a looked-up session row is not returned', async () => {
    const { calls } = seededClient({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [
        {
          data: [
            { id: 'c1', consumed_session_id: 'q1' },
            { id: 'c2', consumed_session_id: 'q2' },
          ],
          error: null,
        },
      ],
      quiz_sessions: [
        { data: [{ id: 'q1', users: { email: 'fixture@example.com' } }], error: null },
      ],
    })
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toMatch(/no session row for q2/)
    expect(err?.message).not.toMatch(/q1/)
    expect(calls.some((c) => c.table === 'internal_exam_codes' && c.method === 'delete')).toBe(
      false,
    )
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
    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      /cleanupE2eExamSittings: .*sessions boom/,
    )
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
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/cleanupE2eExamSittings: .*lookup/)
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
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/cleanupE2eExamSittings: .*u1 blocked/)
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

  it('pages the seeded groups by id keyset and deletes every page', async () => {
    const page1 = Array.from({ length: ID_CHUNK }, (_, i) => ({ id: `g${i}` }))
    const page2 = Array.from({ length: 30 }, (_, i) => ({ id: `g${ID_CHUNK + i}` }))
    const ok = { data: [], error: null }
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      // Page 1's member and group deletes each take one entry before page 2's lookup.
      student_groups: [{ data: page1, error: null }, ok, { data: page2, error: null }],
    })
    await cleanupE2eExamSittings()
    const gts = calls
      .filter((c) => c.table === 'student_groups' && c.method === 'gt')
      .map((c) => c.args)
    expect(gts).toEqual([['id', `g${ID_CHUNK - 1}`]])
    const deleted = calls
      .filter((c) => c.table === 'student_groups' && c.method === 'in' && c.args[0] === 'id')
      .map((c) => c.args[1])
    expect(deleted).toEqual([page1.map((g) => g.id), page2.map((g) => g.id)])
    expect(calls.filter((c) => c.table === 'student_groups' && c.method === 'eq')[0]?.args).toEqual(
      ['organization_id', 'org-7'],
    )
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
    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      /cleanupE2eExamSittings: .*members blocked/,
    )
    expect(deleteUser).toHaveBeenCalledWith('u1')
  })
})

describe('cleanupE2eExamSittings (page-cap refusals)', () => {
  function withAuth(queues: Record<string, Result[]>) {
    const calls = mockTables(queues)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return { calls, deleteUser }
  }

  // A page of exactly `max_rows` is what PostgREST returns when it truncates: the read guards on
  // the unlimited lookups (seeded sittings, entries, codes, people) key on it.
  function fullPage(row: (i: number) => Record<string, unknown>) {
    return Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => row(i))
  }

  it('limits the marked-sitting lookup to ID_CHUNK rows', async () => {
    const { calls } = withAuth({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    const lookup = calls.filter((c) => c.table === 'exam_sittings')
    const markedLike = lookup.findIndex(
      (c) => c.method === 'like' && c.args[1] === `${EXAM_SITTING_E2E_PREFIX}%`,
    )
    expect(markedLike).toBeGreaterThan(-1)
    expect(lookup.slice(markedLike).find((c) => c.method === 'limit')?.args).toEqual([ID_CHUNK])
  })

  it.each(['exam_sitting_entries', 'exam_sitting_candidates'])(
    'refuses a full %s page instead of soft-deleting a sitting whose people it could not see',
    async (table) => {
      const { calls } = withAuth({
        exam_sittings: [
          { data: [{ id: 's1' }, { id: 's2' }], error: null },
          { data: [], error: null },
        ],
        [table]: [{ data: fullPage(() => ({ sitting_id: 's1' })), error: null }],
      })
      await expect(cleanupE2eExamSittings()).rejects.toThrow(
        `cleanupEmptySittings: ${POSTGREST_MAX_ROWS} ${table} row(s) for 2 marked sitting(s)`,
      )
      expect(calls.some((c) => c.method === 'update')).toBe(false)
    },
  )

  it('refuses a full seeded-sitting page instead of deleting a partial list', async () => {
    const { calls, deleteUser } = withAuth({
      exam_sittings: [
        { data: [], error: null },
        { data: fullPage((i) => ({ id: `s${i}` })), error: null },
      ],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      `cleanupSeededExamSittings: ${POSTGREST_MAX_ROWS} seeded sitting(s) hits PostgREST's max_rows`,
    )
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('refuses a full seeded-entry page instead of deleting a partial list', async () => {
    const { calls } = withAuth({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: fullPage((i) => ({ id: `e${i}` })), error: null }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      `deleteSeededRows: ${POSTGREST_MAX_ROWS} seeded entry(s) for sitting s1 hits PostgREST's max_rows`,
    )
    // The entries lookup ran: the refusal is the guard's, not an earlier step's.
    expect(
      calls.find(
        (c) =>
          c.table === 'exam_sitting_entries' && c.method === 'eq' && c.args[0] === 'sitting_id',
      )?.args,
    ).toEqual(['sitting_id', 's1'])
    expect(calls.some((c) => c.table === 'internal_exam_codes')).toBe(false)
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('refuses a full seeded-code page of a later entry chunk instead of orphaning a session beyond it', async () => {
    const { calls } = withAuth({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [
        { data: Array.from({ length: 250 }, (_, i) => ({ id: `e${i}` })), error: null },
      ],
      internal_exam_codes: [
        { data: [{ id: 'c0', consumed_session_id: null }], error: null },
        { data: fullPage((i) => ({ id: `c${i}`, consumed_session_id: `q${i}` })), error: null },
      ],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      `deleteSeededRows: ${POSTGREST_MAX_ROWS} seeded code(s) for ${ID_CHUNK} seeded entry(s) hits PostgREST's max_rows`,
    )
    // Chunk 2 was refused: chunk 3 was never read.
    expect(
      calls.filter((c) => c.table === 'internal_exam_codes' && c.method === 'in'),
    ).toHaveLength(2)
    // No session was classified, retired or deleted, and no code was deleted.
    expect(calls.some((c) => c.table === 'quiz_sessions')).toBe(false)
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('accepts more code rows in total than max_rows when no single response is full', async () => {
    const entries = Array.from({ length: POSTGREST_MAX_ROWS - 1 }, (_, i) => ({ id: `e${i}` }))
    const chunks = Math.ceil(entries.length / ID_CHUNK)
    const { calls } = withAuth({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: entries, error: null }],
      internal_exam_codes: Array.from({ length: chunks }, (_, k) => ({
        data: Array.from({ length: 120 }, (_, i) => ({
          id: `c${k}-${i}`,
          consumed_session_id: null,
        })),
        error: null,
      })),
    })
    await cleanupE2eExamSittings()
    expect(
      calls.filter((c) => c.table === 'internal_exam_codes' && c.method === 'delete'),
    ).toHaveLength(chunks)
  })

  it('limits the seeded-group lookup to ID_CHUNK rows', async () => {
    const { calls } = withAuth({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.find((c) => c.table === 'student_groups' && c.method === 'limit')?.args).toEqual([
      ID_CHUNK,
    ])
  })

  it('limits the seeded-user lookup to ID_CHUNK rows', async () => {
    const { calls } = withAuth({ exam_sittings: [{ data: [], error: null }] })
    await cleanupE2eExamSittings()
    expect(calls.find((c) => c.table === 'users' && c.method === 'like')?.args).toEqual([
      'email',
      expect.stringContaining('%'),
    ])
    expect(calls.find((c) => c.table === 'users' && c.method === 'limit')?.args).toEqual([ID_CHUNK])
  })
})

describe('cleanupE2eExamSittings (seeded users and sessions)', () => {
  function withAuth(queues: Record<string, Result[]>) {
    const calls = mockTables(queues)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return { calls, deleteUser }
  }

  const seededUsers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i}` }))
  const lens = (calls: Call[], table: string, col: string) =>
    calls
      .filter((c) => c.table === table && c.method === 'in' && c.args[0] === col)
      .map((c) => (c.args[1] as string[]).length)

  it('looks the sessions of every looked-up student up in one list of at most ID_CHUNK ids', async () => {
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: seededUsers(ID_CHUNK), error: null }],
    })
    await cleanupE2eExamSittings()
    expect(lens(calls, 'quiz_sessions', 'student_id')).toEqual([ID_CHUNK])
  })

  it('deletes the sessions and consuming codes of many sessions in lists of at most ID_CHUNK', async () => {
    const sessions = Array.from({ length: 250 }, (_, i) => ({ id: `q${i}` }))
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: seededUsers(3), error: null }],
      quiz_sessions: [{ data: sessions, error: null }],
    })
    await cleanupE2eExamSittings()
    expect(lens(calls, 'internal_exam_codes', 'consumed_session_id')).toEqual([100, 100, 50])
    expect(lens(calls, 'quiz_sessions', 'id')).toEqual([100, 100, 50])
    const ids = sessions.map((s) => s.id)
    const expected = [ids.slice(0, 100), ids.slice(100, 200), ids.slice(200)]
    const slices = (table: string, col: string) =>
      calls
        .filter((c) => c.table === table && c.method === 'in' && c.args[0] === col)
        .map((c) => c.args[1])
    expect(slices('internal_exam_codes', 'consumed_session_id')).toEqual(expected)
    expect(slices('quiz_sessions', 'id')).toEqual(expected)
  })

  it('scopes the users lookup, the sessions read and the consuming-code delete to the organization', async () => {
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: seededUsers(2), error: null }],
      quiz_sessions: [{ data: [{ id: 'q0' }], error: null }],
    })
    await cleanupE2eExamSittings()
    const scoped = (table: string, method: string) =>
      calls.some(
        (c) =>
          c.table === table &&
          c.method === 'eq' &&
          c.args[0] === 'organization_id' &&
          c.args[1] === 'org-7',
      ) && calls.some((c) => c.table === table && c.method === method)
    expect(scoped('users', 'like')).toBe(true)
    expect(scoped('quiz_sessions', 'in')).toBe(true)
    expect(scoped('internal_exam_codes', 'delete')).toBe(true)
  })

  it('pages the seeded users by id keyset and deletes every page', async () => {
    const page2 = Array.from({ length: 30 }, (_, i) => ({ id: `u${ID_CHUNK + i}` }))
    const ok = { data: [], error: null }
    const { calls, deleteUser } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      // Each user delete takes one `users` entry between the two lookups.
      users: [
        { data: seededUsers(ID_CHUNK), error: null },
        ...Array.from({ length: ID_CHUNK }, () => ok),
        { data: page2, error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const gts = calls.filter((c) => c.table === 'users' && c.method === 'gt').map((c) => c.args)
    expect(gts).toEqual([['id', `u${ID_CHUNK - 1}`]])
    expect(deleteUser).toHaveBeenCalledTimes(ID_CHUNK + 30)
  })

  it('skips only the failed users page, advances past it and reports the error', async () => {
    const { deleteUser, calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [
        { data: seededUsers(ID_CHUNK), error: null },
        { data: [{ id: 'u100' }], error: null },
      ],
      quiz_sessions: [{ data: null, error: { message: 'page one sessions boom' } }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/page one sessions boom/)
    expect(calls.filter((c) => c.table === 'users' && c.method === 'gt')).toHaveLength(1)
    expect(deleteUser).toHaveBeenCalledTimes(1)
    expect(deleteUser).toHaveBeenCalledWith('u100')
  })

  it('deletes no user when the sessions step fails, and reports it', async () => {
    const { deleteUser, calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [{ data: seededUsers(3), error: null }],
      quiz_sessions: [{ data: null, error: { message: 'batch sessions boom' } }],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      /cleanupE2eExamSittings: .*batch sessions boom/,
    )
    expect(deleteUser).not.toHaveBeenCalled()
    expect(calls.some((c) => c.table === 'users' && c.method === 'delete')).toBe(false)
    expect(calls.some((c) => c.table === 'course_enrolments' && c.method === 'delete')).toBe(false)
  })
})

describe('cleanupE2eExamSittings (seeded rows in chunks)', () => {
  const SEEDED = 'e2e-sit-a@lmsplus.local'
  const FIXTURE = 'e2e-internal-exam@lmsplus.local'

  /** One entry per id, 250 of them: three code chunks of 100, 100, 50. */
  const entries = Array.from({ length: 250 }, (_, i) => ({ id: `e${i}` }))
  const split = <T>(rows: T[]) => {
    const out: T[][] = []
    for (let i = 0; i < rows.length; i += ID_CHUNK) out.push(rows.slice(i, i + ID_CHUNK))
    return out
  }
  /** Code rows, one result per entry chunk; `session(i)` is the session code i consumed. */
  const codeResults = (session: (i: number) => string | null) =>
    split(entries).map((part, k) => ({
      data: part.map((_, j) => ({
        id: `c${k * ID_CHUNK + j}`,
        consumed_session_id: session(k * ID_CHUNK + j),
      })),
      error: null as null,
    }))
  const sessionRows = (ids: string[], email: string) =>
    split(ids).map((part) => ({
      data: part.map((id) => ({ id, users: { email } })),
      error: null as null,
    }))
  const idsOf = (n: number) => Array.from({ length: n }, (_, i) => `q${i}`)
  const updated = (ids: string[]) =>
    split(ids).map((part) => ({ data: part.map((id) => ({ id })), error: null as null }))

  function run(queues: Record<string, Result[]>) {
    const calls = mockTables({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: entries, error: null }],
      ...queues,
    })
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return calls
  }

  /** Lengths of the id lists of `.in(col, …)` calls whose statement opened with `op`. */
  const lens = (calls: Call[], table: string, col: string, op: string, payload?: string) =>
    calls
      .map((c, i) => ({
        c,
        // The op (`delete`/`select`) before the `.in()`, past the org predicate in between.
        prev: calls
          .slice(0, i)
          .reverse()
          .find((p) => !(p.method === 'eq' && p.args[0] === 'organization_id')),
      }))
      .filter(
        ({ c, prev }) =>
          c.table === table &&
          c.method === 'in' &&
          c.args[0] === col &&
          prev?.method === op &&
          (payload === undefined || JSON.stringify(prev.args[0]).includes(payload)),
      )
      .map(({ c }) => (c.args[1] as string[]).length)

  /** The id lists themselves, in call order (same selection as `lens`). */
  const slices = (calls: Call[], table: string, col: string, op: string, payload?: string) =>
    calls
      .map((c, i) => ({
        c,
        // The op (`delete`/`select`) before the `.in()`, past the org predicate in between.
        prev: calls
          .slice(0, i)
          .reverse()
          .find((p) => !(p.method === 'eq' && p.args[0] === 'organization_id')),
      }))
      .filter(
        ({ c, prev }) =>
          c.table === table &&
          c.method === 'in' &&
          c.args[0] === col &&
          prev?.method === op &&
          (payload === undefined || JSON.stringify(prev.args[0]).includes(payload)),
      )
      .map(({ c }) => c.args[1] as string[])

  const seededRun = () => {
    const ids = idsOf(250)
    return run({
      internal_exam_codes: codeResults((i) => ids[i] ?? null),
      quiz_sessions: sessionRows(ids, SEEDED),
    })
  }
  const fixtureRun = () => {
    const ids = idsOf(250)
    return run({
      internal_exam_codes: codeResults((i) => ids[i] ?? null),
      quiz_sessions: [...sessionRows(ids, FIXTURE), ...updated(ids)],
    })
  }

  it('selects and deletes the codes of 250 entries in lists of 100, 100, 50', async () => {
    const calls = seededRun()
    await cleanupE2eExamSittings()
    expect(lens(calls, 'internal_exam_codes', 'sitting_entry_id', 'select')).toEqual([100, 100, 50])
    expect(lens(calls, 'internal_exam_codes', 'sitting_entry_id', 'delete')).toEqual([100, 100, 50])
    const expected = split(entries.map((e) => e.id))
    expect(slices(calls, 'internal_exam_codes', 'sitting_entry_id', 'select')).toEqual(expected)
    expect(slices(calls, 'internal_exam_codes', 'sitting_entry_id', 'delete')).toEqual(expected)
  })

  it('classifies the sessions of 250 codes in lists of 100, 100, 50 and deletes none per sitting', async () => {
    const calls = seededRun()
    await cleanupE2eExamSittings()
    expect(lens(calls, 'quiz_sessions', 'id', 'select')).toEqual([100, 100, 50])
    expect(slices(calls, 'quiz_sessions', 'id', 'select')).toEqual(split(idsOf(250)))
    expect(calls.some((c) => c.table === 'quiz_sessions' && c.method === 'delete')).toBe(false)
  })

  it('retires the fixture sessions of 250 codes in lists of 100, 100, 50, soft-delete first', async () => {
    const calls = fixtureRun()
    await cleanupE2eExamSittings()
    expect(lens(calls, 'quiz_sessions', 'id', 'update', 'deleted_at')).toEqual([100, 100, 50])
    expect(lens(calls, 'quiz_sessions', 'id', 'update', 'ended_at')).toEqual([100, 100, 50])
    const expected = split(idsOf(250))
    expect(slices(calls, 'quiz_sessions', 'id', 'update', 'deleted_at')).toEqual(expected)
    expect(slices(calls, 'quiz_sessions', 'id', 'update', 'ended_at')).toEqual(expected)
    const firstEnd = calls.findIndex(
      (c) => c.method === 'update' && JSON.stringify(c.args[0]).includes('ended_at'),
    )
    const lastSoft = calls.findLastIndex(
      (c) => c.method === 'update' && JSON.stringify(c.args[0]).includes('deleted_at'),
    )
    expect(lastSoft).toBeLessThan(firstEnd)
  })

  it('retires the fixture sessions before the first code delete', async () => {
    const calls = fixtureRun()
    await cleanupE2eExamSittings()
    const lastRetire = calls.findLastIndex(
      (c) => c.table === 'quiz_sessions' && c.method === 'update',
    )
    const firstCodeDelete = calls.findIndex(
      (c) => c.table === 'internal_exam_codes' && c.method === 'delete',
    )
    expect(lastRetire).toBeGreaterThanOrEqual(0)
    expect(firstCodeDelete).toBeGreaterThanOrEqual(0)
    expect(lastRetire).toBeLessThan(firstCodeDelete)
  })

  it('tears down when two codes share one session across a chunk boundary', async () => {
    // `consumed_session_id` is not unique: code 150 (chunk 2) re-uses code 0's session.
    const ids = idsOf(250)
    const unique = ids.filter((id) => id !== 'q150')
    const calls = run({
      internal_exam_codes: codeResults((i) => (i === 150 ? 'q0' : (ids[i] ?? null))),
      quiz_sessions: [...sessionRows(unique, FIXTURE), ...updated(unique)],
    })
    await cleanupE2eExamSittings()
    expect(lens(calls, 'quiz_sessions', 'id', 'select')).toEqual([100, 100, 49])
    expect(lens(calls, 'quiz_sessions', 'id', 'update', 'deleted_at')).toEqual([100, 100, 49])
    expect(slices(calls, 'quiz_sessions', 'id', 'select')).toEqual(split(unique))
    expect(slices(calls, 'quiz_sessions', 'id', 'update', 'deleted_at')).toEqual(split(unique))
  })

  it('classifies a session reported by two chunks once', async () => {
    const ids = idsOf(250)
    const lookups = sessionRows(ids, FIXTURE)
    lookups[1]?.data.push({ id: 'q0', users: { email: FIXTURE } })
    const calls = run({
      internal_exam_codes: codeResults((i) => ids[i] ?? null),
      quiz_sessions: [...lookups, ...updated(ids)],
    })
    await cleanupE2eExamSittings()
    expect(lens(calls, 'quiz_sessions', 'id', 'update', 'deleted_at')).toEqual([100, 100, 50])
  })

  it('still throws when a retire chunk updates fewer rows than it was given', async () => {
    const ids = idsOf(250)
    const soft = updated(ids)
    soft[1] = { data: soft[1]?.data.slice(1) ?? [], error: null }
    run({
      internal_exam_codes: codeResults((i) => ids[i] ?? null),
      quiz_sessions: [...sessionRows(ids, FIXTURE), ...soft],
    })
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toMatch(/fixture sessions soft-delete: expected 100 row\(s\), updated 99/)
  })
})

describe('cleanupE2eExamSittings (organization scope)', () => {
  const FIXTURE = 'e2e-internal-exam@lmsplus.local'
  const isOrgEq = (c: Call) =>
    c.method === 'eq' && c.args[0] === 'organization_id' && c.args[1] === 'org-7'
  const chainsOf = (calls: Call[], table: string, has: (c: Call) => boolean) => {
    const bySeq = new Map<number, Call[]>()
    for (const c of calls) {
      if (c.table === table) bySeq.set(c.seq, [...(bySeq.get(c.seq) ?? []), c])
    }
    return [...bySeq.values()].filter((cs) => cs.some(has))
  }
  const patchHas = (key: string) => (c: Call) =>
    c.method === 'update' && key in ((c.args[0] ?? {}) as object)
  const expectScoped = (calls: Call[], table: string, has: (c: Call) => boolean) => {
    const found = chainsOf(calls, table, has)
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((cs) => cs.some(isOrgEq))).toBe(true)
  }

  async function runSeeded() {
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const calls = mockTables({
      exam_sittings: [
        { data: [], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1', consumed_session_id: 'q1' }], error: null }],
      quiz_sessions: [
        { data: [{ id: 'q1', users: { email: FIXTURE } }], error: null },
        { data: [{ id: 'q1' }], error: null },
      ],
      student_groups: [{ data: [{ id: 'g1' }], error: null }],
      users: [{ data: [{ id: 'u1' }], error: null }],
    })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    await cleanupE2eExamSittings()
    return calls
  }

  async function runEmptyPage() {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    return calls
  }

  it.each([
    [
      'quiz_sessions',
      'the fixture-session classification lookup',
      (c: Call) => c.method === 'select' && String(c.args[0]).startsWith('id, users'),
    ],
    ['quiz_sessions', 'the fixture-session soft-delete', patchHas('deleted_at')],
    ['quiz_sessions', 'the fixture-session end', patchHas('ended_at')],
    [
      'exam_sitting_entries',
      'the seeded-entries lookup',
      (c: Call) => c.method === 'select' && c.args[0] === 'id',
    ],
    ['internal_exam_codes', 'the seeded-codes lookup', (c: Call) => c.method === 'select'],
    ['student_group_members', 'the group-members delete', (c: Call) => c.method === 'delete'],
    ['student_groups', 'the groups delete', (c: Call) => c.method === 'delete'],
    ['course_enrolments', 'the enrolments delete', (c: Call) => c.method === 'delete'],
    ['users', 'the user delete', (c: Call) => c.method === 'delete'],
  ])('scopes %s %s to org-7', async (table, _what, has) => {
    expectScoped(await runSeeded(), table, has)
  })

  it.each([
    [
      'exam_sittings',
      'the marked-sittings lookup',
      (c: Call) => c.method === 'like' && c.args[1] === `${EXAM_SITTING_E2E_PREFIX}%`,
    ],
    ['exam_sitting_entries', 'the live-entries lookup', (c: Call) => c.method === 'select'],
    ['exam_sitting_candidates', 'the live-candidates lookup', (c: Call) => c.method === 'select'],
    ['exam_sittings', 'the soft-delete', patchHas('deleted_by')],
  ])('scopes %s %s to org-7', async (table, _what, has) => {
    expectScoped(await runEmptyPage(), table, has)
  })

  it('stamps the soft-delete with the admin id adminIds returned', async () => {
    const calls = await runEmptyPage()
    const patch = calls.find(patchHas('deleted_by'))?.args[0] as { deleted_by: string }
    expect(patch.deleted_by).toBe('admin-7')
  })

  it('issues no exam_sittings query and reports the error once when adminIds rejects', async () => {
    vi.mocked(adminIds).mockRejectedValueOnce(new Error('admin lookup: config boom'))
    const calls = mockTables({ exam_sittings: [{ data: [{ id: 's1' }], error: null }] })
    const err = await cleanupE2eExamSittings().then(
      () => null,
      (e: Error) => e,
    )
    expect(err?.message).toBe('cleanupE2eExamSittings: admin lookup: config boom')
    expect(calls.filter((c) => c.table === 'exam_sittings')).toHaveLength(0)
  })
})

describe('markE2eSitting', () => {
  it('writes the E2E-SIT- marker to the sitting id', async () => {
    const calls = mockTables({ exam_sittings: [{ data: [{ id: 's1' }], error: null }] })
    await markE2eSitting('s1')
    const upd = calls.find((c) => c.method === 'update')
    const patch = (upd?.args[0] ?? {}) as { permitted_materials?: string }
    expect(patch.permitted_materials).toMatch(new RegExp(`^${EXAM_SITTING_E2E_PREFIX}`))
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([
      ['organization_id', 'org-7'],
      ['id', 's1'],
    ])
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

describe('cleanupE2eExamSittings (lookup failure after an earlier page error)', () => {
  const fullPage = (prefix: string) =>
    Array.from({ length: ID_CHUNK }, (_, i) => ({ id: `${prefix}${i}` }))

  function withAuth(queues: Record<string, Result[]>) {
    const calls = mockTables(queues)
    const deleteUser = vi.fn().mockResolvedValue({ error: null })
    const client = mockGetAdminClient() as Record<string, unknown>
    mockGetAdminClient.mockReturnValue({ ...client, auth: { admin: { deleteUser } } })
    return { calls, deleteUser }
  }

  it('reports the empty-sitting page error and the later lookup error together', async () => {
    const { calls } = withAuth({
      exam_sittings: [
        { data: fullPage('s'), error: null },
        { data: null, error: { message: 'page two lookup boom' } },
      ],
      exam_sitting_entries: [{ data: null, error: { message: 'page one people boom' } }],
    })
    const thrown = await cleanupE2eExamSittings().then(
      () => '',
      (e: unknown) => (e as Error).message,
    )
    expect(thrown).toContain('page one people boom')
    expect(thrown).toContain('page two lookup boom')
    expect(calls.filter((c) => c.table === 'exam_sittings' && c.method === 'gt')).toHaveLength(1)
  })

  it('reports the seeded-group page error and the later lookup error together', async () => {
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      student_groups: [
        { data: fullPage('g'), error: null },
        { data: null, error: { message: 'groups page two lookup boom' } },
      ],
      student_group_members: [{ data: null, error: { message: 'members page one boom' } }],
    })
    const thrown = await cleanupE2eExamSittings().then(
      () => '',
      (e: unknown) => (e as Error).message,
    )
    expect(thrown).toContain('members page one boom')
    expect(thrown).toContain('groups page two lookup boom')
    expect(calls.filter((c) => c.table === 'student_groups' && c.method === 'gt')).toHaveLength(1)
  })

  it('reports the seeded-user page error and the later lookup error together', async () => {
    const { calls } = withAuth({
      exam_sittings: [{ data: [], error: null }],
      users: [
        { data: fullPage('u'), error: null },
        { data: null, error: { message: 'users page two lookup boom' } },
      ],
      quiz_sessions: [{ data: null, error: { message: 'users page one sessions boom' } }],
    })
    const thrown = await cleanupE2eExamSittings().then(
      () => '',
      (e: unknown) => (e as Error).message,
    )
    expect(thrown).toContain('users page one sessions boom')
    expect(thrown).toContain('users page two lookup boom')
    expect(calls.filter((c) => c.table === 'users' && c.method === 'gt')).toHaveLength(1)
  })
})
