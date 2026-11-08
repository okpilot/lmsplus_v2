import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import {
  cleanupE2eSyllabus,
  getSubjectDeletedAt,
  makeSyllabusE2eCode,
  SYLLABUS_E2E_CODE_PREFIX,
} from './syllabus-cleanup'

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

const OK_EMPTY: Result = { data: [], error: null }
const fail = (message: string): Result => ({ data: null, error: { message } })

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

function fromCalls(calls: Call[], table: string, method: string): Call[] {
  return calls.filter((c) => c.table === table && c.method === method)
}

const updates = (calls: Call[]) => calls.filter((c) => c.method === 'update')

describe('makeSyllabusE2eCode', () => {
  it('returns a marked code of at most 10 characters', () => {
    const code = makeSyllabusE2eCode()
    expect(code.startsWith(SYLLABUS_E2E_CODE_PREFIX)).toBe(true)
    expect(code.length).toBeLessThanOrEqual(10)
  })
})

describe('cleanupE2eSyllabus', () => {
  it('soft-deletes marked subtopics, topics and subjects in FK order, scoped by marker and parent ids', async () => {
    const calls = mockTables({
      easa_subjects: [
        { data: [{ id: 's1' }, { id: 's2' }], error: null },
        { data: [{ id: 's1' }], error: null },
      ],
      easa_topics: [
        { data: [{ id: 't1' }], error: null },
        { data: [{ id: 't1' }], error: null },
      ],
      easa_subtopics: [{ data: [{ id: 'x1' }], error: null }],
    })

    await expect(cleanupE2eSyllabus()).resolves.toBe(3)

    expect(updates(calls).map((c) => c.table)).toEqual([
      'easa_subtopics',
      'easa_topics',
      'easa_subjects',
    ])
    for (const u of updates(calls)) {
      expect(u.args[0]).toEqual({ deleted_at: expect.any(String) })
    }
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
    // Both find calls and all three updates filter on still-active rows.
    const activeFilters = calls.filter((c) => c.method === 'is')
    expect(activeFilters).toHaveLength(5)
    for (const f of activeFilters) expect(f.args).toEqual(['deleted_at', null])
    expect(fromCalls(calls, 'easa_subjects', 'is')).toHaveLength(2)
    expect(fromCalls(calls, 'easa_topics', 'is')).toHaveLength(2)
    expect(fromCalls(calls, 'easa_subtopics', 'is')).toHaveLength(1)
    expect(fromCalls(calls, 'easa_subjects', 'like').map((c) => c.args)).toEqual([
      ['code', 'E2E-%'],
      ['code', 'E2E-%'],
    ])
    expect(fromCalls(calls, 'easa_topics', 'or')[0]?.args[0]).toBe(
      'subject_id.in.(s1,s2),code.like.E2E-%',
    )
    expect(fromCalls(calls, 'easa_subtopics', 'or')[0]?.args[0]).toBe(
      'topic_id.in.(t1),code.like.E2E-%',
    )
    expect(fromCalls(calls, 'easa_topics', 'or')[1]?.args[0]).toBe(
      'subject_id.in.(s1,s2),code.like.E2E-%',
    )
  })

  it('falls back to the code marker alone when no marked subject or topic exists', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY, OK_EMPTY],
      easa_topics: [OK_EMPTY, OK_EMPTY],
      easa_subtopics: [OK_EMPTY],
    })

    await cleanupE2eSyllabus()

    expect(fromCalls(calls, 'easa_topics', 'or')[0]?.args[0]).toBe('code.like.E2E-%')
    expect(fromCalls(calls, 'easa_subtopics', 'or')[0]?.args[0]).toBe('code.like.E2E-%')
  })

  it('returns 0 and stays silent when zero rows matched', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, OK_EMPTY],
      easa_topics: [OK_EMPTY, OK_EMPTY],
      easa_subtopics: [OK_EMPTY],
    })

    await expect(cleanupE2eSyllabus()).resolves.toBe(0)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('treats null data from an update as zero rows', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, { data: null, error: null }],
      easa_topics: [OK_EMPTY, { data: null, error: null }],
      easa_subtopics: [{ data: null, error: null }],
    })

    await expect(cleanupE2eSyllabus()).resolves.toBe(0)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('logs the soft-deleted count of each table that lost rows and returns the total', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, { data: [{ id: 'a' }], error: null }],
      easa_topics: [OK_EMPTY, { data: [{ id: 'b' }, { id: 'c' }], error: null }],
      easa_subtopics: [{ data: [{ id: 'd' }, { id: 'e' }, { id: 'f' }], error: null }],
    })

    await expect(cleanupE2eSyllabus()).resolves.toBe(6)

    expect(logSpy).toHaveBeenCalledWith('cleanupE2eSyllabus: soft-deleted 3 easa_subtopics row(s)')
    expect(logSpy).toHaveBeenCalledWith('cleanupE2eSyllabus: soft-deleted 2 easa_topics row(s)')
    expect(logSpy).toHaveBeenCalledWith('cleanupE2eSyllabus: soft-deleted 1 easa_subjects row(s)')
  })

  it('throws and updates nothing when the subject lookup fails', async () => {
    const calls = mockTables({ easa_subjects: [fail('subjects down')] })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/find subjects: subjects down/)
    expect(updates(calls)).toHaveLength(0)
  })

  it('throws and updates nothing when the topic lookup fails', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY],
      easa_topics: [fail('topics down')],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/find topics: topics down/)
    expect(updates(calls)).toHaveLength(0)
  })

  it('throws when the subtopic update fails and skips the topic and subject updates', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY],
      easa_topics: [OK_EMPTY],
      easa_subtopics: [fail('subtopics down')],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/delete subtopics: subtopics down/)
    expect(updates(calls).map((c) => c.table)).toEqual(['easa_subtopics'])
  })

  it('throws when the topic update fails and skips the subject update', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY],
      easa_topics: [OK_EMPTY, fail('topic update down')],
      easa_subtopics: [OK_EMPTY],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/delete topics: topic update down/)
    expect(updates(calls).map((c) => c.table)).toEqual(['easa_subtopics', 'easa_topics'])
  })

  it('throws when the subject update fails', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, fail('subject update down')],
      easa_topics: [OK_EMPTY, OK_EMPTY],
      easa_subtopics: [OK_EMPTY],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/delete subjects: subject update down/)
  })

  it('reports a non-Error throw as its string form', async () => {
    mockGetAdminClient.mockImplementation(() => {
      throw 'client unavailable'
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/find subjects: client unavailable/)
  })
})

describe('getSubjectDeletedAt', () => {
  it('returns the deleted_at timestamp of the subject with that code', async () => {
    const calls = mockTables({
      easa_subjects: [{ data: { deleted_at: '2026-11-07T00:00:00Z' }, error: null }],
    })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).resolves.toBe('2026-11-07T00:00:00Z')
    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['code', 'E2E-AAAAAA'])
  })

  it('returns null for a live subject', async () => {
    mockTables({ easa_subjects: [{ data: { deleted_at: null }, error: null }] })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).resolves.toBeNull()
  })

  it('returns undefined when no row exists', async () => {
    mockTables({ easa_subjects: [{ data: null, error: null }] })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).resolves.toBeUndefined()
  })

  it('throws when the read fails', async () => {
    mockTables({ easa_subjects: [fail('boom')] })
    await expect(getSubjectDeletedAt('E2E-AAAAAA')).rejects.toThrow('getSubjectDeletedAt: boom')
  })
})
