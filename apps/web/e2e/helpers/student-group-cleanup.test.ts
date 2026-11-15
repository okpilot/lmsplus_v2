import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import {
  cleanupE2eStudentGroups,
  makeStudentGroupE2eName,
  STUDENT_GROUP_E2E_PREFIX,
} from './student-group-cleanup'

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

/** Each `from(table)` takes the next queued result for that table, in call order. */
function mockTables(queues: Record<string, Result[]>) {
  const calls: Call[] = []
  mockGetAdminClient.mockReturnValue({
    from: (table: string) =>
      buildChain(queues[table]?.shift() ?? { data: [], error: null }, calls, table),
  })
  return calls
}

const fail = (message: string): Result => ({ data: null, error: { message } })

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('makeStudentGroupE2eName', () => {
  it('returns a unique prefixed name within 80 chars', () => {
    const a = makeStudentGroupE2eName()
    const b = makeStudentGroupE2eName()
    expect(a.startsWith(STUDENT_GROUP_E2E_PREFIX)).toBe(true)
    expect(a.length).toBeLessThanOrEqual(80)
    expect(a).not.toBe(b)
  })
})

describe('cleanupE2eStudentGroups', () => {
  it('soft-deletes marked groups and their memberships, never hard-deleting', async () => {
    const calls = mockTables({
      student_groups: [
        { data: [{ id: 'g1' }, { id: 'g2' }], error: null },
        { data: [{ id: 'g1' }, { id: 'g2' }], error: null },
      ],
      student_group_members: [{ data: [{ id: 'm1' }], error: null }],
    })

    await cleanupE2eStudentGroups()

    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(
      calls.some(
        (c) =>
          c.table === 'student_groups' &&
          c.method === 'like' &&
          c.args[0] === 'name' &&
          c.args[1] === `${STUDENT_GROUP_E2E_PREFIX}%`,
      ),
    ).toBe(true)
    const memUpdate = calls.find(
      (c) => c.table === 'student_group_members' && c.method === 'update',
    )
    expect(memUpdate?.args[0]).toEqual({ deleted_at: expect.any(String) })
    expect(
      calls.some(
        (c) =>
          c.table === 'student_group_members' &&
          c.method === 'in' &&
          c.args[0] === 'group_id' &&
          JSON.stringify(c.args[1]) === JSON.stringify(['g1', 'g2']),
      ),
    ).toBe(true)
    expect(
      calls.some(
        (c) =>
          c.table === 'student_group_members' &&
          c.method === 'is' &&
          c.args[0] === 'deleted_at' &&
          c.args[1] === null,
      ),
    ).toBe(true)
    const grpUpdate = calls.find((c) => c.table === 'student_groups' && c.method === 'update')
    expect(grpUpdate?.args[0]).toEqual({ deleted_at: expect.any(String) })
    expect(
      calls.some(
        (c) =>
          c.table === 'student_groups' &&
          c.method === 'in' &&
          c.args[0] === 'id' &&
          JSON.stringify(c.args[1]) === JSON.stringify(['g1', 'g2']),
      ),
    ).toBe(true)
    expect(calls.filter((c) => c.method === 'update')).toHaveLength(2)
    expect(calls.filter((c) => c.method === 'select' && c.args[0] === 'id')).toHaveLength(3)
  })

  it('logs the soft-deleted count of each table that lost rows', async () => {
    mockTables({
      student_groups: [
        { data: [{ id: 'g1' }, { id: 'g2' }], error: null },
        { data: [{ id: 'g1' }, { id: 'g2' }], error: null },
      ],
      student_group_members: [{ data: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], error: null }],
    })

    await cleanupE2eStudentGroups()

    expect(logSpy).toHaveBeenCalledWith(
      'cleanupE2eStudentGroups: soft-deleted 3 student_group_members row(s)',
    )
    expect(logSpy).toHaveBeenCalledWith(
      'cleanupE2eStudentGroups: soft-deleted 2 student_groups row(s)',
    )
  })

  it('stays silent when the updates match zero rows', async () => {
    mockTables({
      student_groups: [
        { data: [{ id: 'g1' }], error: null },
        { data: [], error: null },
      ],
      student_group_members: [{ data: null, error: null }],
    })

    await expect(cleanupE2eStudentGroups()).resolves.toBeUndefined()

    expect(logSpy).not.toHaveBeenCalled()
  })

  it('is a silent no-op when no marked group exists', async () => {
    const calls = mockTables({ student_groups: [{ data: [], error: null }] })

    await expect(cleanupE2eStudentGroups()).resolves.toBeUndefined()

    expect(calls.some((c) => c.method === 'update')).toBe(false)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('treats null data as no groups', async () => {
    const calls = mockTables({ student_groups: [{ data: null, error: null }] })

    await expect(cleanupE2eStudentGroups()).resolves.toBeUndefined()

    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('throws when the group lookup fails', async () => {
    mockTables({ student_groups: [fail('find boom')] })

    await expect(cleanupE2eStudentGroups()).rejects.toThrow('cleanupE2eStudentGroups: find boom')
  })

  it('throws when the membership update fails and does not touch groups', async () => {
    const calls = mockTables({
      student_groups: [{ data: [{ id: 'g1' }], error: null }],
      student_group_members: [fail('mem boom')],
    })

    await expect(cleanupE2eStudentGroups()).rejects.toThrow(
      'cleanupE2eStudentGroups members: mem boom',
    )
    expect(calls.some((c) => c.table === 'student_groups' && c.method === 'update')).toBe(false)
  })

  it('throws when the group update fails', async () => {
    mockTables({
      student_groups: [{ data: [{ id: 'g1' }], error: null }, fail('grp boom')],
      student_group_members: [{ data: [{ id: 'm1' }], error: null }],
    })

    await expect(cleanupE2eStudentGroups()).rejects.toThrow(
      'cleanupE2eStudentGroups groups: grp boom',
    )
  })
})
