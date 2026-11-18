import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import {
  cleanupCreatedExamConfigs,
  countActiveSubjectExamConfigs,
  ensureExamConfigs,
  insertExamConfig,
  softDeleteSubjectExamConfigs,
} from './exam-config-cleanup'

type Call = { table: string; method: string; args: unknown[] }
type Result = { data: unknown; error: { message: string } | null; count?: number }

function buildChain(returnValue: unknown, calls: Call[], table: string) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push({ table, method: String(prop), args })
        return buildChain(returnValue, calls, table)
      }
    },
  })
}

function mockTables(tables: Record<string, Result>) {
  const calls: Call[] = []
  mockGetAdminClient.mockReturnValue({
    from: (table: string) => buildChain(tables[table] ?? { data: null, error: null }, calls, table),
  })
  return calls
}

beforeEach(() => {
  vi.resetAllMocks()
})

const SINCE = '2026-10-27T00:00:00.000Z'

describe('softDeleteSubjectExamConfigs', () => {
  it('soft-deletes active exam_configs of the subject by setting deleted_at, never hard-deleting', async () => {
    const calls = mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: [{ id: 'cfg-1' }], error: null },
    })

    await softDeleteSubjectExamConfigs('100', SINCE)

    const update = calls.find((c) => c.table === 'exam_configs' && c.method === 'update')
    expect(update).toBeDefined()
    expect(update?.args[0]).toEqual(expect.objectContaining({ deleted_at: expect.any(String) }))
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'deleted_at')).toBe(true)
    expect(calls.some((c) => c.method === 'select' && c.args[0] === 'id')).toBe(true)
    expect(
      calls.some((c) => c.method === 'gte' && c.args[0] === 'created_at' && c.args[1] === SINCE),
    ).toBe(true)
  })

  it('resolves without error when no active config matched (zero rows)', async () => {
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: [], error: null },
    })
    await expect(softDeleteSubjectExamConfigs('100', SINCE)).resolves.not.toThrow()
  })

  it('throws when the subject lookup fails', async () => {
    mockTables({ easa_subjects: { data: null, error: { message: 'lookup boom' } } })
    await expect(softDeleteSubjectExamConfigs('100', SINCE)).rejects.toThrow(
      'softDeleteSubjectExamConfigs subject: lookup boom',
    )
  })

  it('returns silently without touching exam_configs when the subject is not found', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const calls = mockTables({ easa_subjects: { data: null, error: null } })

    await expect(softDeleteSubjectExamConfigs('100', SINCE)).resolves.toBeUndefined()

    expect(calls.some((c) => c.table === 'exam_configs')).toBe(false)
    expect(log).not.toHaveBeenCalled()
  })

  it('logs the soft-deleted count when rows were soft-deleted', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: [{ id: 'cfg-1' }, { id: 'cfg-2' }], error: null },
    })

    await softDeleteSubjectExamConfigs('100', SINCE)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('softDeleteSubjectExamConfigs: soft-deleted 2 config(s)')
  })

  it('stays silent when zero rows were soft-deleted', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: [], error: null },
    })

    await softDeleteSubjectExamConfigs('100', SINCE)

    expect(log).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: null, error: { message: 'boom' } },
    })
    await expect(softDeleteSubjectExamConfigs('100', SINCE)).rejects.toThrow(/boom/)
  })
})

describe('countActiveSubjectExamConfigs', () => {
  it('counts active configs of the subject', async () => {
    const calls = mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: null, error: null, count: 2 } as Result,
    })
    await expect(countActiveSubjectExamConfigs('100')).resolves.toBe(2)
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'deleted_at')).toBe(true)
  })

  it('returns 0 when the subject is missing', async () => {
    mockTables({ easa_subjects: { data: null, error: null } })
    await expect(countActiveSubjectExamConfigs('100')).resolves.toBe(0)
  })

  it('throws when the subject lookup fails', async () => {
    mockTables({ easa_subjects: { data: null, error: { message: 'lookup boom' } } })
    await expect(countActiveSubjectExamConfigs('100')).rejects.toThrow(/lookup boom/)
  })

  it('throws when the count fails', async () => {
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: null, error: { message: 'boom' } },
    })
    await expect(countActiveSubjectExamConfigs('100')).rejects.toThrow(/boom/)
  })
})

type Cfg = { subject_id: string; enabled: boolean; deleted_at: string | null }

function fakeConfigAdmin(o: {
  subjects: { id: string; course_id: string }[]
  configs: Cfg[]
  deleteError?: string
}) {
  const inserted: Record<string, unknown>[] = []
  const deletedIds: string[][] = []
  const builder = (table: string) => {
    let op = 'select'
    const api: Record<string, unknown> = {}
    const result = () => {
      if (op === 'delete') {
        return o.deleteError
          ? { data: null, error: { message: o.deleteError } }
          : { data: (deletedIds.at(-1) ?? []).map((id) => ({ id })), error: null }
      }
      return { data: table === 'easa_subjects' ? o.subjects : o.configs, error: null }
    }
    for (const m of ['select', 'eq', 'is']) api[m] = () => api
    api.insert = (row: Record<string, unknown>) => {
      op = 'insert'
      inserted.push(row)
      return api
    }
    api.delete = () => {
      op = 'delete'
      return api
    }
    api.in = (_c: string, ids: string[]) => {
      deletedIds.push(ids)
      return api
    }
    api.single = () => Promise.resolve({ data: { id: `cfg-${inserted.length}` }, error: null })
    // biome-ignore lint/suspicious/noThenProperty: awaitable mock
    api.then = (r: (v: unknown) => void) => Promise.resolve(result()).then(r)
    return api
  }
  mockGetAdminClient.mockReturnValue({ from: builder })
  return { inserted, deletedIds }
}

const ppl = (n: number) => ({ id: `ppl-${n}`, course_id: 'PPL' })
const rt = (n: number) => ({ id: `rt-${n}`, course_id: 'RT' })

describe('insertExamConfig', () => {
  it('inserts an enabled config for the subject in the organization and returns its id', async () => {
    const { inserted } = fakeConfigAdmin({ subjects: [], configs: [] })
    const id = await insertExamConfig(mockGetAdminClient() as never, { orgId: 'o', subjectId: 's' })
    expect(id).toBe('cfg-1')
    expect(inserted[0]).toMatchObject({ organization_id: 'o', subject_id: 's', enabled: true })
  })
})

describe('ensureExamConfigs', () => {
  it('inserts only the missing config when one subject of the course is already enabled', async () => {
    const { inserted } = fakeConfigAdmin({
      subjects: [ppl(1), ppl(2), rt(1)],
      configs: [{ subject_id: 'ppl-1', enabled: true, deleted_at: null }],
    })
    await ensureExamConfigs('o')
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ organization_id: 'o', subject_id: 'ppl-2' })
    await cleanupCreatedExamConfigs()
  })

  it('inserts nothing when a course already has two enabled configs', async () => {
    const { inserted } = fakeConfigAdmin({
      subjects: [ppl(1), ppl(2)],
      configs: [
        { subject_id: 'ppl-1', enabled: true, deleted_at: null },
        { subject_id: 'ppl-2', enabled: true, deleted_at: null },
      ],
    })
    await ensureExamConfigs('o')
    expect(inserted).toHaveLength(0)
  })

  it('inserts nothing when a later course already has two enabled configs', async () => {
    const { inserted } = fakeConfigAdmin({
      subjects: [ppl(1), ppl(2), rt(1), rt(2)],
      configs: [
        { subject_id: 'rt-1', enabled: true, deleted_at: null },
        { subject_id: 'rt-2', enabled: true, deleted_at: null },
      ],
    })
    await ensureExamConfigs('o')
    expect(inserted).toHaveLength(0)
  })

  it('never reuses a subject that already has a disabled or deleted config row', async () => {
    const { inserted } = fakeConfigAdmin({
      subjects: [ppl(1), ppl(2), ppl(3)],
      configs: [{ subject_id: 'ppl-1', enabled: false, deleted_at: null }],
    })
    await ensureExamConfigs('o')
    expect(inserted.map((r) => r.subject_id)).toEqual(['ppl-2', 'ppl-3'])
    await cleanupCreatedExamConfigs()
  })

  it('fails with a clear message when no course can reach two configs', async () => {
    fakeConfigAdmin({ subjects: [ppl(1), rt(1)], configs: [] })
    await expect(ensureExamConfigs('o')).rejects.toThrow(
      /ensureExamConfigs: no course has 2 subjects/,
    )
  })
})

describe('cleanupCreatedExamConfigs', () => {
  it('deletes only the configs ensureExamConfigs created, then forgets them', async () => {
    const { deletedIds } = fakeConfigAdmin({ subjects: [ppl(1), ppl(2)], configs: [] })
    await ensureExamConfigs('o')
    await cleanupCreatedExamConfigs()
    expect(deletedIds.at(-1)).toEqual(['cfg-1', 'cfg-2'])
    const before = deletedIds.length
    await cleanupCreatedExamConfigs()
    expect(deletedIds).toHaveLength(before)
  })

  it('throws when the delete fails and keeps the ids for a retry', async () => {
    fakeConfigAdmin({ subjects: [ppl(1), ppl(2)], configs: [], deleteError: 'fk block' })
    await ensureExamConfigs('o')
    await expect(cleanupCreatedExamConfigs()).rejects.toThrow('cleanupCreatedExamConfigs: fk block')
    fakeConfigAdmin({ subjects: [], configs: [] })
    await cleanupCreatedExamConfigs()
  })
})
