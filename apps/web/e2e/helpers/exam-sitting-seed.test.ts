import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))
vi.mock('./admin-supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { EXAM_SITTING_E2E_PREFIX } from './exam-sitting-markers'
import { createStudent, insertPassedSession, seedSitting } from './exam-sitting-seed'

type Insert = { table: string; rows: Record<string, unknown>[] }

function fakeAdmin(
  opts: { failUsersInsert?: boolean; failRollback?: boolean; dropFirstEntryId?: boolean } = {},
) {
  const inserts: Insert[] = []
  const createUserArgs: Record<string, unknown>[] = []
  const created: string[] = []
  const deleted: string[] = []
  const updates: Insert[] = []
  let n = 0
  const builder = (table: string) => {
    const api: Record<string, unknown> = {}
    let lastInsert: Record<string, unknown>[] = []
    const result = () => {
      if (table === 'easa_subjects') {
        return {
          data: [
            { id: 's-1', short: 'MET', course_id: 'c-1' },
            { id: 's-2', short: 'AIR', course_id: 'c-1' },
            { id: 's-3', short: 'NAV', course_id: 'c-2' },
          ],
          error: null,
        }
      }
      if (table === 'exam_sitting_entries' && lastInsert.length > 0) {
        // PostgREST does not promise input order: hand them back reversed.
        const rows = lastInsert.map((r) => ({ id: `e-${r.subject_id}`, subject_id: r.subject_id }))
        return { data: opts.dropFirstEntryId ? rows.slice(1) : rows.reverse(), error: null }
      }
      return { data: [{ id: `id-${++n}`, short: 'FPM', course_id: 'course-1' }], error: null }
    }
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'like', 'neq']) {
      api[m] = () => api
    }
    api.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      lastInsert = Array.isArray(rows) ? rows : [rows]
      inserts.push({ table, rows: lastInsert })
      if (table === 'users' && opts.failUsersInsert) {
        return Promise.resolve({ data: null, error: { message: 'duplicate key' } })
      }
      return api
    }
    api.update = (row: Record<string, unknown>) => {
      updates.push({ table, rows: [row] })
      return api
    }
    api.single = () => Promise.resolve({ data: { id: `id-${++n}` }, error: null })
    api.maybeSingle = () =>
      Promise.resolve({
        data: table === 'exam_configs' ? { pass_mark: 70 } : { id: `id-${++n}` },
        error: null,
      })
    // biome-ignore lint/suspicious/noThenProperty: awaitable mock
    api.then = (r: (v: unknown) => void) => Promise.resolve(result()).then(r)
    return api
  }
  mockGetAdminClient.mockReturnValue({
    from: builder,
    auth: {
      admin: {
        createUser: async (attrs: Record<string, unknown>) => {
          createUserArgs.push(attrs)
          const id = `u-${++n}`
          created.push(id)
          return { data: { user: { id } }, error: null }
        },
        deleteUser: async (id: string) => {
          deleted.push(id)
          return { error: opts.failRollback ? { message: 'auth down' } : null }
        },
      },
    },
  })
  return { inserts, createUserArgs, created, deleted, updates }
}

beforeEach(() => vi.resetAllMocks())

describe('seedSitting', () => {
  it('inserts a sitting carrying the E2E-SIT- marker in permitted_materials', async () => {
    const { inserts } = fakeAdmin()
    await seedSitting({ people: [{ name: 'Ann', entries: [{ state: 'live' }] }] })
    const sitting = inserts.find((i) => i.table === 'exam_sittings')
    expect(String(sitting?.rows[0]?.permitted_materials)).toMatch(
      new RegExp(`^${EXAM_SITTING_E2E_PREFIX}`),
    )
  })

  it('seeds one candidate per person and one entry per listed exam', async () => {
    const { inserts } = fakeAdmin()
    await seedSitting({
      people: [
        { name: 'Ann', entries: [{ state: 'live' }, { state: 'no_code' }] },
        { name: 'Bea', entries: [] },
      ],
    })
    const cands = inserts
      .filter((i) => i.table === 'exam_sitting_candidates')
      .flatMap((i) => i.rows)
    const entries = inserts.filter((i) => i.table === 'exam_sitting_entries').flatMap((i) => i.rows)
    expect(cands).toHaveLength(2)
    expect(entries).toHaveLength(2)
  })

  it('returns the sitting id and the seeded people', async () => {
    fakeAdmin()
    const r = await seedSitting({ people: [{ name: 'Ann', entries: [] }] })
    expect(typeof r.sittingId).toBe('string')
    expect(r.people[0]).toMatchObject({ name: 'Ann' })
    expect(typeof r.people[0]?.userId).toBe('string')
  })

  it('rolls the auth user back when the users insert fails', async () => {
    const { created, deleted } = fakeAdmin({ failUsersInsert: true })
    await expect(
      seedSitting({ people: [{ name: 'Ann', entries: [{ state: 'live' }] }] }),
    ).rejects.toThrow(/users row/)
    expect(deleted).toEqual(created)
    expect(deleted).toHaveLength(1)
  })

  it('reports a failed rollback alongside the insert error', async () => {
    fakeAdmin({ failUsersInsert: true, failRollback: true })
    await expect(
      seedSitting({ people: [{ name: 'Ann', entries: [{ state: 'live' }] }] }),
    ).rejects.toThrow(/rollback also failed: auth down/)
  })

  it('pairs each seeded code with its own entry when the insert returns rows out of order', async () => {
    const { inserts } = fakeAdmin()
    await seedSitting({
      people: [{ name: 'Ann', entries: [{ state: 'live' }, { state: 'expired' }] }],
    })
    const entries = inserts.filter((i) => i.table === 'exam_sitting_entries').flatMap((i) => i.rows)
    const codes = inserts.filter((i) => i.table === 'internal_exam_codes').flatMap((i) => i.rows)
    expect(entries).toHaveLength(2)
    expect(codes).toHaveLength(2)
    for (const c of codes) expect(c.sitting_entry_id).toBe(`e-${c.subject_id}`)
  })

  it('fails loudly when an entry id is missing from the insert result', async () => {
    fakeAdmin({ dropFirstEntryId: true })
    await expect(
      seedSitting({ people: [{ name: 'Ann', entries: [{ state: 'live' }, { state: 'live' }] }] }),
    ).rejects.toThrow(/entry id/)
  })
})

describe('seedSitting addable people, enrolment and groups', () => {
  it('creates addable students that are not candidates and deactivates the flagged one', async () => {
    const { inserts, updates } = fakeAdmin()
    const r = await seedSitting({
      people: [{ name: 'Ann', entries: [] }],
      addable: [{ name: 'Zed' }, { name: 'Dee', deactivated: true }],
    })
    const cands = inserts
      .filter((i) => i.table === 'exam_sitting_candidates')
      .flatMap((i) => i.rows)
    expect(cands).toHaveLength(1)
    const users = inserts.filter((i) => i.table === 'users').flatMap((i) => i.rows)
    expect(users.map((u) => u.full_name)).toEqual(expect.arrayContaining(['Ann', 'Zed', 'Dee']))
    expect(users.every((u) => String(u.email).startsWith('e2e-sit-'))).toBe(true)
    expect(r.addable.map((a) => a.name)).toEqual(['Zed', 'Dee'])
    const dead = updates.find((u) => u.table === 'users')
    expect(dead?.rows[0]).toHaveProperty('deleted_at')
  })

  it('enrols an enrolled person without exams in the first configured subject course', async () => {
    const { inserts } = fakeAdmin()
    await seedSitting({
      people: [
        { name: 'Ann', entries: [], enrolled: true },
        { name: 'Bea', entries: [] },
      ],
    })
    const enrol = inserts.filter((i) => i.table === 'course_enrolments').flatMap((i) => i.rows)
    expect(enrol).toHaveLength(1)
    expect(enrol[0]).toMatchObject({ course_id: 'c-1' })
  })

  it('builds groups named E2E-GRP-SIT- with the listed people and addable people as members', async () => {
    const { inserts } = fakeAdmin()
    const r = await seedSitting({
      people: [{ name: 'Ann', entries: [] }],
      addable: [{ name: 'Zed' }],
      groups: [{ name: 'Alpha', members: ['Ann', 'Zed'] }],
    })
    const group = inserts.find((i) => i.table === 'student_groups')
    expect(group?.rows[0]).toMatchObject({ name: 'E2E-GRP-SIT-Alpha' })
    const members = inserts.find((i) => i.table === 'student_group_members')
    expect(members?.rows.map((m) => m.user_id)).toEqual([r.people[0]?.userId, r.addable[0]?.userId])
    expect(r.groups[0]?.name).toBe('E2E-GRP-SIT-Alpha')
  })

  it('rejects a group member that is not a seeded person', async () => {
    fakeAdmin()
    await expect(
      seedSitting({ people: [], groups: [{ name: 'Alpha', members: ['Nobody'] }] }),
    ).rejects.toThrow(/unknown member Nobody/)
  })
})

describe('seedSitting subjects', () => {
  it('returns the subjects its exams are drawn from', async () => {
    fakeAdmin()
    const r = await seedSitting({ people: [{ name: 'Ann', entries: [] }] })
    expect(r.subjects[0]).toMatchObject({ short: 'MET', course_id: 'c-1' })
  })
})

describe('insertPassedSession', () => {
  function configAdmin(res: { data: unknown; error: { message: string } | null }) {
    const filters: string[] = []
    const insert = vi.fn()
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit']) chain[m] = () => chain
    chain.eq = (col: string, v: unknown) => {
      filters.push(`eq:${col}=${String(v)}`)
      return chain
    }
    chain.is = (col: string, v: unknown) => {
      filters.push(`is:${col}=${String(v)}`)
      return chain
    }
    chain.maybeSingle = () => Promise.resolve(res)
    const admin = {
      from: (t: string) => (t === 'exam_configs' ? chain : { insert }),
    }
    return { admin, filters, insert }
  }
  const session = {
    orgId: 'o',
    userId: 'u',
    subjectId: 's',
    score: 83,
    endedAt: new Date('2026-11-19T10:00:00.000Z'),
  }

  it('looks the pass mark up by org, subject, enabled and not deleted', async () => {
    const { admin, filters } = configAdmin({ data: null, error: null })
    await insertPassedSession(admin as never, session).catch(() => undefined)
    expect(filters).toEqual(
      expect.arrayContaining([
        'eq:organization_id=o',
        'eq:subject_id=s',
        'eq:enabled=true',
        'is:deleted_at=null',
      ]),
    )
  })

  it('throws without inserting when the subject has no enabled exam config', async () => {
    const { admin, insert } = configAdmin({ data: null, error: null })
    await expect(insertPassedSession(admin as never, session)).rejects.toThrow(
      /^insertPassedSession enabled exam config for subject s \(ensureExamConfigs configures only MIN_CONFIGS subjects\): no data$/,
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it('throws without inserting when the exam config lookup errors', async () => {
    const { admin, insert } = configAdmin({ data: null, error: { message: 'boom' } })
    await expect(insertPassedSession(admin as never, session)).rejects.toThrow(
      'insertPassedSession exam config lookup: boom',
    )
    expect(insert).not.toHaveBeenCalled()
  })

  it("takes the pass mark from the subject's enabled exam config", async () => {
    const { inserts } = fakeAdmin()
    await insertPassedSession(mockGetAdminClient(), {
      orgId: 'o',
      userId: 'u',
      subjectId: 's',
      score: 83,
      endedAt: new Date('2026-11-19T10:00:00.000Z'),
    })
    expect(inserts.find((i) => i.table === 'quiz_sessions')?.rows[0]).toMatchObject({
      config: { pass_mark: 70, question_ids: [] },
    })
  })

  it('inserts a passed internal-exam session ending at the given time with the score', async () => {
    const { inserts } = fakeAdmin()
    const endedAt = new Date('2026-11-19T10:00:00.000Z')
    const id = await insertPassedSession(mockGetAdminClient(), {
      orgId: 'o',
      userId: 'u',
      subjectId: 's',
      score: 83,
      endedAt,
    })
    expect(typeof id).toBe('string')
    expect(inserts.find((i) => i.table === 'quiz_sessions')?.rows[0]).toMatchObject({
      student_id: 'u',
      mode: 'internal_exam',
      passed: true,
      score_percentage: 83,
      ended_at: endedAt.toISOString(),
      started_at: '2026-11-19T09:30:00.000Z',
    })
  })
})

describe('createStudent', () => {
  it('creates an auth user with no credential, so a seeded student can never sign in', async () => {
    // The teardown hard-deletes these students' sessions; answers are immutable, so a student
    // that could sign in and answer would make that delete a 23503 with no legal fix.
    const { createUserArgs } = fakeAdmin()
    await createStudent(mockGetAdminClient(), 'o', 'Ann')
    expect(createUserArgs).toHaveLength(1)
    expect(createUserArgs[0]).toHaveProperty('email')
    expect(createUserArgs[0]).not.toHaveProperty('password')
    expect(createUserArgs[0]).not.toHaveProperty('phone')
  })

  it('heads a failure with the caller prefix', async () => {
    mockGetAdminClient.mockReturnValue({
      auth: { admin: { createUser: async () => ({ data: {}, error: { message: 'nope' } }) } },
    })
    await expect(createStudent(mockGetAdminClient(), 'o', 'Ann', 'flowSeed')).rejects.toThrow(
      'flowSeed auth user: nope',
    )
  })
})
