import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
vi.mock('./admin-supabase', () => ({ ADMIN_TEST_EMAIL: 'admin@test.local' }))
vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))

import { cleanupE2eExamSittings } from './exam-sitting-cleanup'
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
