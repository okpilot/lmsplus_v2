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
      student_groups: { data: [{ id: 'g1' }, { id: 'g2' }], error: null },
      student_group_members: { data: null, error: null },
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
  })

  it('is a silent no-op when no marked group exists', async () => {
    const calls = mockTables({ student_groups: { data: [], error: null } })

    await expect(cleanupE2eStudentGroups()).resolves.toBeUndefined()

    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('treats null data as no groups', async () => {
    const calls = mockTables({ student_groups: { data: null, error: null } })

    await expect(cleanupE2eStudentGroups()).resolves.toBeUndefined()

    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })

  it('throws when the group lookup fails', async () => {
    mockTables({ student_groups: { data: null, error: { message: 'find boom' } } })

    await expect(cleanupE2eStudentGroups()).rejects.toThrow('cleanupE2eStudentGroups: find boom')
  })

  it('throws when the membership update fails and does not touch groups', async () => {
    const calls = mockTables({
      student_groups: { data: [{ id: 'g1' }], error: null },
      student_group_members: { data: null, error: { message: 'mem boom' } },
    })

    await expect(cleanupE2eStudentGroups()).rejects.toThrow(
      'cleanupE2eStudentGroups members: mem boom',
    )
    expect(calls.some((c) => c.table === 'student_groups' && c.method === 'update')).toBe(false)
  })
})
