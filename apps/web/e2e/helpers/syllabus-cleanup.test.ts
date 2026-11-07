import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdminClient } = vi.hoisted(() => ({
  mockGetAdminClient: vi.fn(),
}))

vi.mock('./supabase', () => ({
  getAdminClient: mockGetAdminClient,
}))

import { cleanupE2eSyllabus, E2E_SYLLABUS_CODE_PREFIX, newE2eSubjectCode } from './syllabus-cleanup'

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

describe('cleanupE2eSyllabus', () => {
  it('deletes marked subtopics, topics and subjects in FK order, scoped by marker and parent ids', async () => {
    const calls = mockTables({
      easa_subjects: [{ data: [{ id: 's1' }, { id: 's2' }], error: null }, OK_EMPTY],
      easa_topics: [{ data: [{ id: 't1' }], error: null }, OK_EMPTY],
      easa_subtopics: [OK_EMPTY],
    })

    await cleanupE2eSyllabus()

    const deletes = calls.filter((c) => c.method === 'delete').map((c) => c.table)
    expect(deletes).toEqual(['easa_subtopics', 'easa_topics', 'easa_subjects'])
    expect(fromCalls(calls, 'easa_subjects', 'like')[0]?.args).toEqual(['code', 'E2E-%'])
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

  it('stays silent when zero rows matched', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, OK_EMPTY],
      easa_topics: [OK_EMPTY, OK_EMPTY],
      easa_subtopics: [OK_EMPTY],
    })

    await expect(cleanupE2eSyllabus()).resolves.toBeUndefined()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('treats null data from a delete as zero rows', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, { data: null, error: null }],
      easa_topics: [OK_EMPTY, { data: null, error: null }],
      easa_subtopics: [{ data: null, error: null }],
    })

    await expect(cleanupE2eSyllabus()).resolves.toBeUndefined()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('logs the deleted count of each table that lost rows', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, { data: [{ id: 'a' }], error: null }],
      easa_topics: [OK_EMPTY, { data: [{ id: 'b' }, { id: 'c' }], error: null }],
      easa_subtopics: [{ data: [{ id: 'd' }, { id: 'e' }, { id: 'f' }], error: null }],
    })

    await cleanupE2eSyllabus()

    expect(logSpy).toHaveBeenCalledWith('cleanupE2eSyllabus: deleted 3 easa_subtopics row(s)')
    expect(logSpy).toHaveBeenCalledWith('cleanupE2eSyllabus: deleted 2 easa_topics row(s)')
    expect(logSpy).toHaveBeenCalledWith('cleanupE2eSyllabus: deleted 1 easa_subjects row(s)')
  })

  it('throws and deletes nothing when the subject lookup fails', async () => {
    const calls = mockTables({ easa_subjects: [fail('subjects down')] })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/find subjects: subjects down/)
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('throws and deletes nothing when the topic lookup fails', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY],
      easa_topics: [fail('topics down')],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/find topics: topics down/)
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })

  it('throws when the subtopic delete fails and skips the topic and subject deletes', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY],
      easa_topics: [OK_EMPTY],
      easa_subtopics: [fail('subtopics down')],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/delete subtopics: subtopics down/)
    expect(calls.filter((c) => c.method === 'delete').map((c) => c.table)).toEqual([
      'easa_subtopics',
    ])
  })

  it('throws when the topic delete fails and skips the subject delete', async () => {
    const calls = mockTables({
      easa_subjects: [OK_EMPTY],
      easa_topics: [OK_EMPTY, fail('topic delete down')],
      easa_subtopics: [OK_EMPTY],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/delete topics: topic delete down/)
    expect(calls.filter((c) => c.method === 'delete').map((c) => c.table)).toEqual([
      'easa_subtopics',
      'easa_topics',
    ])
  })

  it('throws when the subject delete fails', async () => {
    mockTables({
      easa_subjects: [OK_EMPTY, fail('subject delete down')],
      easa_topics: [OK_EMPTY, OK_EMPTY],
      easa_subtopics: [OK_EMPTY],
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/delete subjects: subject delete down/)
  })

  it('reports a non-Error throw as its string form', async () => {
    mockGetAdminClient.mockImplementation(() => {
      throw 'client unavailable'
    })

    await expect(cleanupE2eSyllabus()).rejects.toThrow(/find subjects: client unavailable/)
  })
})

describe('newE2eSubjectCode', () => {
  it('carries the marker prefix and fits the 10-character subject code limit', () => {
    const code = newE2eSubjectCode()

    expect(code.startsWith(E2E_SYLLABUS_CODE_PREFIX)).toBe(true)
    expect(code).toHaveLength(10)
  })
})
