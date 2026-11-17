import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({ mockGetAdminClient: vi.fn() }))

vi.mock('./supabase', () => ({ getAdminClient: mockGetAdminClient }))

import {
  cleanupE2eExamSittings,
  EXAM_SITTING_E2E_PREFIX,
  makeSittingE2eMaterials,
} from './exam-sitting-cleanup'

type Call = { table: string; method: string; args: unknown[] }
type Result = { data: unknown; error: { message: string } | null }

function buildChain(result: Result, calls: Call[], table: string) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push({ table, method: String(prop), args })
        return buildChain(result, calls, table)
      }
    },
  })
}

const ok = (data: unknown): Result => ({ data, error: null })
const MARKED = [{ id: 's1', created_by: 'u1', closed_at: null }]

/** Each `from(table)` call takes the next queued result for that table; the last one repeats. */
function mockTables(results: Record<string, Result | Result[]>) {
  const calls: Call[] = []
  const used: Record<string, number> = {}
  mockGetAdminClient.mockReturnValue({
    from: (table: string) => {
      const r = results[table] ?? ok([])
      const queue = Array.isArray(r) ? r : [r]
      const i = Math.min(used[table] ?? 0, queue.length - 1)
      used[table] = (used[table] ?? 0) + 1
      return buildChain(queue[i] as Result, calls, table)
    },
  })
  return calls
}

const boom = (message: string): Result => ({ data: null, error: { message } })

const firstUpdate = (calls: Call[], table: string) =>
  calls.findIndex((c) => c.table === table && c.method === 'update')

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('makeSittingE2eMaterials', () => {
  it('returns a unique E2E-SIT- prefixed value within 1000 chars', () => {
    const a = makeSittingE2eMaterials()
    expect(EXAM_SITTING_E2E_PREFIX).toBe('E2E-SIT-')
    expect(a.startsWith('E2E-SIT-')).toBe(true)
    expect(a.length).toBeLessThanOrEqual(1000)
    expect(a).not.toBe(makeSittingE2eMaterials())
  })
})

describe('cleanupE2eExamSittings', () => {
  it('finds marked live sittings by permitted_materials prefix', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: ok([{ id: 'e1', sitting_id: 's1' }]),
    })

    await cleanupE2eExamSittings()

    expect(
      calls.some(
        (c) =>
          c.table === 'exam_sittings' &&
          c.method === 'like' &&
          c.args[0] === 'permitted_materials' &&
          c.args[1] === 'E2E-SIT-%',
      ),
    ).toBe(true)
    expect(
      calls.some(
        (c) => c.table === 'exam_sittings' && c.method === 'is' && c.args[0] === 'deleted_at',
      ),
    ).toBe(true)
  })

  it('voids codes, then soft-deletes entries, candidates and sittings in that order', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: ok([{ id: 'e1', sitting_id: 's1' }]),
      exam_sitting_candidates: ok([{ id: 'c1' }]),
      internal_exam_codes: ok([{ id: 'k1' }]),
    })

    await cleanupE2eExamSittings()

    const order = [
      firstUpdate(calls, 'internal_exam_codes'),
      firstUpdate(calls, 'exam_sitting_entries'),
      firstUpdate(calls, 'exam_sitting_candidates'),
      firstUpdate(calls, 'exam_sittings'),
    ]
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('never hard-deletes and stamps deleted_by with the sitting created_by', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: ok([{ id: 'e1', sitting_id: 's1' }]),
    })

    await cleanupE2eExamSittings()

    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    const upd = calls.find((c) => c.table === 'exam_sittings' && c.method === 'update')
    expect(upd?.args[0]).toMatchObject({ deleted_at: expect.any(String), deleted_by: 'u1' })
  })

  it('is a silent no-op with zero writes when no marked sitting exists', async () => {
    const calls = mockTables({ exam_sittings: ok([]) })

    await expect(cleanupE2eExamSittings()).resolves.toBeUndefined()

    expect(calls.some((c) => c.method === 'update' || c.method === 'delete')).toBe(false)
  })

  it('treats null data as no sittings', async () => {
    const calls = mockTables({ exam_sittings: ok(null) })

    await expect(cleanupE2eExamSittings()).resolves.toBeUndefined()

    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('throws with context when the sitting lookup fails', async () => {
    mockTables({ exam_sittings: { data: null, error: { message: 'find boom' } } })

    await expect(cleanupE2eExamSittings()).rejects.toThrow('cleanupE2eExamSittings: find boom')
  })

  it('throws when the entry lookup fails and writes nothing', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: boom('lookup boom'),
    })

    await expect(cleanupE2eExamSittings()).rejects.toThrow(/entries: lookup boom/)
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('reports an entry-update failure after reaching the update, and still soft-deletes the sitting', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: [ok([{ id: 'e1', sitting_id: 's1' }]), boom('entry boom')],
    })

    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      /cleanupE2eExamSittings.*entries: entry boom/,
    )
    expect(calls.some((c) => c.table === 'exam_sitting_entries' && c.method === 'update')).toBe(
      true,
    )
    expect(calls.some((c) => c.table === 'exam_sittings' && c.method === 'update')).toBe(true)
  })

  it('reports a code-void failure and continues to later steps', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: ok([{ id: 'e1', sitting_id: 's1' }]),
      internal_exam_codes: boom('code boom'),
    })

    await expect(cleanupE2eExamSittings()).rejects.toThrow(/codes: code boom/)
    expect(calls.some((c) => c.table === 'exam_sitting_candidates' && c.method === 'update')).toBe(
      true,
    )
    expect(calls.some((c) => c.table === 'exam_sittings' && c.method === 'update')).toBe(true)
  })

  it('reports a candidate-update failure and continues to the sitting', async () => {
    const calls = mockTables({
      exam_sittings: ok(MARKED),
      exam_sitting_entries: ok([{ id: 'e1', sitting_id: 's1' }]),
      exam_sitting_candidates: boom('cand boom'),
    })

    await expect(cleanupE2eExamSittings()).rejects.toThrow(/candidates: cand boom/)
    expect(calls.some((c) => c.table === 'exam_sittings' && c.method === 'update')).toBe(true)
  })

  it('reports a sitting-update failure', async () => {
    mockTables({
      exam_sittings: [ok(MARKED), boom('sit boom')],
      exam_sitting_entries: ok([{ id: 'e1', sitting_id: 's1' }]),
    })

    await expect(cleanupE2eExamSittings()).rejects.toThrow(/sittings: sit boom/)
  })

  it('accumulates every failure into one error', async () => {
    mockTables({
      exam_sittings: [ok(MARKED), boom('sit boom')],
      exam_sitting_entries: [ok([{ id: 'e1', sitting_id: 's1' }]), boom('entry boom')],
      exam_sitting_candidates: boom('cand boom'),
      internal_exam_codes: boom('code boom'),
    })

    await expect(cleanupE2eExamSittings()).rejects.toThrow(
      /code boom.*entry boom.*cand boom.*sit boom/,
    )
  })

  it('logs the affected row counts per table', async () => {
    mockTables({
      exam_sittings: [ok(MARKED), ok([{ id: 's1' }])],
      exam_sitting_entries: [
        ok([{ id: 'e1', sitting_id: 's1' }]),
        ok([{ id: 'e1' }, { id: 'e2' }]),
      ],
      exam_sitting_candidates: ok([{ id: 'c1' }]),
      internal_exam_codes: ok([{ id: 'k1' }]),
    })

    await cleanupE2eExamSittings()

    const log = vi.mocked(console.log)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('soft-deleted 2 exam_sitting_entries'))
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('soft-deleted 1 exam_sitting_candidates'),
    )
    expect(log).toHaveBeenCalledWith(expect.stringContaining('soft-deleted 1 exam_sittings'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('1 internal_exam_codes (voided)'))
  })

  it('stays silent when every mutation affects zero rows', async () => {
    mockTables({
      exam_sittings: [ok(MARKED), ok([])],
      exam_sitting_entries: [ok([{ id: 'e1', sitting_id: 's1' }]), ok([])],
      exam_sitting_candidates: ok([]),
      internal_exam_codes: ok([]),
    })

    await cleanupE2eExamSittings()

    expect(console.log).not.toHaveBeenCalled()
  })

  it('voids codes per sitting with its own created_by and skips soft-deleting closed sittings', async () => {
    const calls = mockTables({
      exam_sittings: ok([
        { id: 's1', created_by: 'u1', closed_at: null },
        { id: 's2', created_by: 'u2', closed_at: '2026-11-17T10:00:00Z' },
      ]),
      exam_sitting_entries: ok([
        { id: 'e1', sitting_id: 's1' },
        { id: 'e2', sitting_id: 's2' },
      ]),
    })

    await cleanupE2eExamSittings()

    const voids = calls.filter((c) => c.table === 'internal_exam_codes' && c.method === 'update')
    expect(voids.map((c) => (c.args[0] as { voided_by: string }).voided_by)).toEqual(['u1', 'u2'])
    const sittingUpdates = calls.filter((c) => c.table === 'exam_sittings' && c.method === 'update')
    expect(sittingUpdates).toHaveLength(1)
    expect(sittingUpdates[0]?.args[0]).toMatchObject({ deleted_by: 'u1' })
  })
})
