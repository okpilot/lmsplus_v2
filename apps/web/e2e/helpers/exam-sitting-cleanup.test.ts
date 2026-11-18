import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))
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
