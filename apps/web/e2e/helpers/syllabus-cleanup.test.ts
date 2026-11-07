import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import {
  getSubjectDeletedAt,
  makeSyllabusE2eCode,
  SYLLABUS_E2E_CODE_PREFIX,
  softDeleteMarkedSyllabusSubjects,
} from './syllabus-cleanup'

type Call = { method: string; args: unknown[] }
type Result = { data: unknown; error: { message: string } | null }

function buildChain(returnValue: Result, calls: Call[]) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: required to make Supabase mock awaitable
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args })
        return buildChain(returnValue, calls)
      }
    },
  })
}

function mockResult(result: Result) {
  const calls: Call[] = []
  mockGetAdminClient.mockReturnValue({
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] })
      return buildChain(result, calls)
    },
  })
  return calls
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('makeSyllabusE2eCode', () => {
  it('returns a marked code of at most 10 characters', () => {
    const code = makeSyllabusE2eCode()
    expect(code.startsWith(SYLLABUS_E2E_CODE_PREFIX)).toBe(true)
    expect(code.length).toBeLessThanOrEqual(10)
  })
})

describe('softDeleteMarkedSyllabusSubjects', () => {
  it('soft-deletes only still-active marked subjects and returns the count', async () => {
    const calls = mockResult({ data: [{ id: 'a' }, { id: 'b' }], error: null })

    await expect(softDeleteMarkedSyllabusSubjects()).resolves.toBe(2)

    const update = calls.find((c) => c.method === 'update')
    expect(update?.args[0]).toEqual({ deleted_at: expect.any(String) })
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    expect(calls.find((c) => c.method === 'like')?.args).toEqual([
      'code',
      `${SYLLABUS_E2E_CODE_PREFIX}%`,
    ])
    expect(calls.find((c) => c.method === 'is')?.args).toEqual(['deleted_at', null])
    expect(calls.find((c) => c.method === 'select')?.args[0]).toBe('id')
  })

  it('returns 0 when no marked subject matched', async () => {
    mockResult({ data: [], error: null })
    await expect(softDeleteMarkedSyllabusSubjects()).resolves.toBe(0)
  })

  it('returns 0 when the response carries no data', async () => {
    mockResult({ data: null, error: null })
    await expect(softDeleteMarkedSyllabusSubjects()).resolves.toBe(0)
  })

  it('throws when the update fails', async () => {
    mockResult({ data: null, error: { message: 'boom' } })
    await expect(softDeleteMarkedSyllabusSubjects()).rejects.toThrow(
      'softDeleteMarkedSyllabusSubjects: boom',
    )
  })
})

describe('getSubjectDeletedAt', () => {
  it('returns the deleted_at timestamp of the subject with that code', async () => {
    const calls = mockResult({ data: { deleted_at: '2026-11-07T00:00:00Z' }, error: null })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).resolves.toBe('2026-11-07T00:00:00Z')
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['code', 'E2E-AAAAAA'])
  })

  it('returns null for a live subject', async () => {
    mockResult({ data: { deleted_at: null }, error: null })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).resolves.toBeNull()
  })

  it('returns undefined when no row exists', async () => {
    mockResult({ data: null, error: null })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).resolves.toBeUndefined()
  })

  it('throws when the read fails', async () => {
    mockResult({ data: null, error: { message: 'boom' } })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).rejects.toThrow('getSubjectDeletedAt: boom')
  })
})
