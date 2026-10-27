import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import { softDeleteSubjectExamConfigs } from './exam-config-cleanup'

type Call = { table: string; method: string; args: unknown[] }
type Result = { data: unknown; error: { message: string } | null }

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

describe('softDeleteSubjectExamConfigs', () => {
  it('soft-deletes active exam_configs of the subject by setting deleted_at, never hard-deleting', async () => {
    const calls = mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: [{ id: 'cfg-1' }], error: null },
    })

    await softDeleteSubjectExamConfigs('100')

    const update = calls.find((c) => c.table === 'exam_configs' && c.method === 'update')
    expect(update).toBeDefined()
    expect(update?.args[0]).toEqual(expect.objectContaining({ deleted_at: expect.any(String) }))
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(calls.some((c) => c.method === 'is' && c.args[0] === 'deleted_at')).toBe(true)
    expect(calls.some((c) => c.method === 'select' && c.args[0] === 'id')).toBe(true)
  })

  it('resolves without error when no active config matched (zero rows)', async () => {
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: [], error: null },
    })
    await expect(softDeleteSubjectExamConfigs('100')).resolves.not.toThrow()
  })

  it('throws when the update fails', async () => {
    mockTables({
      easa_subjects: { data: { id: 'subj-100' }, error: null },
      exam_configs: { data: null, error: { message: 'boom' } },
    })
    await expect(softDeleteSubjectExamConfigs('100')).rejects.toThrow(/boom/)
  })
})
