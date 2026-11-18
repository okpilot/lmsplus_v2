import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { cleanupE2eExamSittings, markE2eSitting } from './exam-sitting-cleanup'
import { EXAM_SITTING_E2E_PREFIX } from './exam-sitting-markers'

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

  it('leaves marked sittings that have entries or candidates', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], error: null },
        { data: [{ id: 's3' }], error: null },
      ],
      exam_sitting_entries: [{ data: [{ sitting_id: 's1' }], error: null }],
      exam_sitting_candidates: [{ data: [{ sitting_id: 's2' }], error: null }],
    })
    await cleanupE2eExamSittings()
    const del = calls.find((c) => c.method === 'delete')
    expect(del?.table).toBe('exam_sittings')
    const inCall = calls.filter((c) => c.table === 'exam_sittings' && c.method === 'in').at(-1)
    expect(inCall?.args).toEqual(['id', ['s3']])
  })

  it('deletes the marked sittings by id', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const del = calls.find((c) => c.method === 'delete')
    expect(del).toBeDefined()
    expect(calls.find((c) => c.method === 'in')?.args[1]).toEqual(['s1', 's2'])
  })

  it('asks the delete to return the removed ids', async () => {
    const calls = mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    const delAt = calls.findIndex((c) => c.method === 'delete')
    const after = calls.slice(delAt + 1)
    expect(after.some((c) => c.table === 'exam_sittings' && c.method === 'select')).toBe(true)
    expect(after.find((c) => c.method === 'select')?.args).toEqual(['id'])
  })

  it('logs the number of sittings the delete actually removed', async () => {
    mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    expect(vi.mocked(console.log)).toHaveBeenCalledWith(
      'cleanupE2eExamSittings: deleted 1 sitting(s)',
    )
  })

  it('stays silent when the delete removes nothing', async () => {
    mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [], error: null },
      ],
    })
    await cleanupE2eExamSittings()
    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
  })

  it('throws when the delete fails', async () => {
    mockTables({
      exam_sittings: [
        { data: [{ id: 's1' }], error: null },
        { data: null, error: { message: 'fk block' } },
      ],
    })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/delete: fk block/)
  })

  it.each(['exam_sitting_entries', 'exam_sitting_candidates'])(
    'throws when the %s lookup fails and deletes nothing',
    async (table) => {
      const calls = mockTables({
        exam_sittings: [{ data: [{ id: 's1' }], error: null }],
        [table]: [{ data: null, error: { message: 'people boom' } }],
      })
      await expect(cleanupE2eExamSittings()).rejects.toThrow(new RegExp(`${table}: people boom`))
      expect(calls.some((c) => c.method === 'delete')).toBe(false)
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

  it('throws on a database error', async () => {
    mockTables({ exam_sittings: [{ data: null, error: { message: 'boom' } }] })
    await expect(markE2eSitting('s1')).rejects.toThrow('markE2eSitting: boom')
  })

  it('throws when no row matched', async () => {
    mockTables({ exam_sittings: [{ data: [], error: null }] })
    await expect(markE2eSitting('s1')).rejects.toThrow('no sitting s1')
  })
})
