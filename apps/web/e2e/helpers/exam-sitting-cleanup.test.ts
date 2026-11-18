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

  it('throws when the lookup fails', async () => {
    mockTables({ exam_sittings: [{ data: null, error: { message: 'boom' } }] })
    await expect(cleanupE2eExamSittings()).rejects.toThrow(/boom/)
  })
})
