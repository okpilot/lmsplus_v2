import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupSittingFixtures, type SittingTrack } from './exam-sitting-seed'

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

type Admin = Parameters<typeof cleanupSittingFixtures>[0]

function mockAdmin(queues: Record<string, Result[]>) {
  const calls: Call[] = []
  const admin = {
    from: (t: string) => chain(queues[t]?.shift() ?? { data: [], error: null }, calls, t),
  }
  return { admin: admin as unknown as Admin, calls }
}

function track(sittingIds: string[], subjectIds: string[] = []): SittingTrack {
  return { sittingIds, subjectIds, adminId: 'admin-1' }
}

const liveEntries: Result = { data: [{ id: 'e1' }, { id: 'e2' }], error: null }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('cleanupSittingFixtures codes step', () => {
  it('soft-deletes the codes before the entries they hang off are retired', async () => {
    const { admin, calls } = mockAdmin({
      exam_sitting_entries: [liveEntries, { data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1' }], error: null }],
    })
    await cleanupSittingFixtures(admin, track(['s1']))
    const codesUpdate = calls.findIndex(
      (c) => c.table === 'internal_exam_codes' && c.method === 'update',
    )
    const entriesUpdate = calls.findIndex(
      (c) => c.table === 'exam_sitting_entries' && c.method === 'update',
    )
    expect(codesUpdate).toBeGreaterThan(-1)
    expect(entriesUpdate).toBeGreaterThan(-1)
    expect(codesUpdate).toBeLessThan(entriesUpdate)
  })

  it('looks the entries up without a live-row filter, so already-retired entries still match', async () => {
    const { admin, calls } = mockAdmin({
      exam_sitting_entries: [liveEntries, { data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1' }], error: null }],
    })
    await cleanupSittingFixtures(admin, track(['s1']))
    const codesUpdate = calls.findIndex(
      (c) => c.table === 'internal_exam_codes' && c.method === 'update',
    )
    const lookup = calls.slice(0, codesUpdate).filter((c) => c.table === 'exam_sitting_entries')
    expect(lookup.map((c) => c.method)).toEqual(['select', 'in'])
    expect(lookup[1]?.args).toEqual(['sitting_id', ['s1']])
  })

  it('stamps deleted_at on the live codes of the looked-up entries', async () => {
    const { admin, calls } = mockAdmin({
      exam_sitting_entries: [liveEntries, { data: [{ id: 'e1' }], error: null }],
      internal_exam_codes: [{ data: [{ id: 'c1' }], error: null }],
    })
    await cleanupSittingFixtures(admin, track(['s1']))
    const codes = calls.filter((c) => c.table === 'internal_exam_codes')
    const patch = codes.find((c) => c.method === 'update')?.args[0] as Record<string, unknown>
    expect(Object.keys(patch)).toEqual(['deleted_at'])
    expect(Number.isNaN(Date.parse(String(patch.deleted_at)))).toBe(false)
    expect(codes.find((c) => c.method === 'in')?.args).toEqual(['sitting_entry_id', ['e1', 'e2']])
    expect(codes.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null])
    expect(codes.some((c) => c.method === 'delete')).toBe(false)
  })

  it('touches no code when the sittings have no entries', async () => {
    const { admin, calls } = mockAdmin({
      exam_sitting_entries: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    })
    await cleanupSittingFixtures(admin, track(['s1']))
    expect(calls.some((c) => c.table === 'internal_exam_codes')).toBe(false)
    expect(vi.mocked(console.log)).not.toHaveBeenCalled()
  })

  it('stays silent when the entries carry no live code', async () => {
    const { admin } = mockAdmin({
      exam_sitting_entries: [liveEntries, { data: [], error: null }],
      internal_exam_codes: [{ data: [], error: null }],
    })
    await cleanupSittingFixtures(admin, track(['s1']))
    expect(vi.mocked(console.log)).not.toHaveBeenCalledWith(
      expect.stringContaining('internal_exam_codes'),
    )
    expect(vi.mocked(console.log)).not.toHaveBeenCalledWith(expect.stringContaining('codes'))
  })

  it('reports the code lookup error and still retires the entries', async () => {
    const { admin, calls } = mockAdmin({
      exam_sitting_entries: [
        { data: null, error: { message: 'entries lookup boom' } },
        { data: [{ id: 'e1' }], error: null },
      ],
    })
    await expect(cleanupSittingFixtures(admin, track(['s1']))).rejects.toThrow(
      /codes: entries lookup boom/,
    )
    expect(calls.some((c) => c.table === 'exam_sitting_entries' && c.method === 'update')).toBe(
      true,
    )
  })
})
