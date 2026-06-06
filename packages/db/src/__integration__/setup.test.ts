import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// setup.ts calls requireEnv() at module scope — the env vars must be present
// before the module is imported. vi.hoisted runs before any import, so we set
// them here. The Supabase client factories (getAdminClient / getAnonClient)
// are lazy functions; the only module-level side effect is requireEnv().
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-stub'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-stub'
})

// Mock the Supabase client constructor so no real network connection is made.
// The mockFrom fn is shared across all client instances created in setup.ts.
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// vitest hoists the vi.mock calls above this import — the module gets the
// mocked createClient and stubbed env vars before its top-level code runs.
import { cleanupReferenceData, seedQuestions } from './setup'

// ---------------------------------------------------------------------------
// buildChain — Proxy-based thenable that forwards every method call back to
// itself and resolves to `returnValue` when awaited. Handles arbitrarily-long
// Supabase query chains (.select().eq().maybeSingle() etc.) without manually
// mocking every step.
// ---------------------------------------------------------------------------
function buildChain(returnValue: unknown): unknown {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

// Minimal admin mock: only `.from()` is needed — seedQuestions does not call
// auth methods.
const adminMock = { from: mockFrom } as unknown as Parameters<typeof seedQuestions>[0]['admin']

const BASE_OPTS = {
  admin: adminMock,
  orgId: 'org-uuid-test',
  createdBy: 'user-uuid-creator',
  subjectId: 'subj-uuid-1',
  topicId: 'topic-uuid-1',
  count: 2,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('seedQuestions', () => {
  it('reuses the existing bank when one is found for the org', async () => {
    const existingBankId = 'bank-uuid-existing'
    const questionIds = [{ id: 'q-1' }, { id: 'q-2' }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: existingBankId }, error: null })) // bank lookup → found
      .mockReturnValueOnce(buildChain({ data: questionIds, error: null })) // questions insert

    const result = await seedQuestions(BASE_OPTS)

    expect(result.bankId).toBe(existingBankId)
    expect(result.questionIds).toEqual(['q-1', 'q-2'])
    // Only 2 .from() calls: lookup + questions insert (no bank insert)
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('creates a new bank when no bank exists for the org', async () => {
    const newBankId = 'bank-uuid-new'
    const questionIds = [{ id: 'q-3' }, { id: 'q-4' }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: null })) // bank lookup → not found
      .mockReturnValueOnce(buildChain({ data: { id: newBankId }, error: null })) // bank insert
      .mockReturnValueOnce(buildChain({ data: questionIds, error: null })) // questions insert

    const result = await seedQuestions(BASE_OPTS)

    expect(result.bankId).toBe(newBankId)
    expect(result.questionIds).toEqual(['q-3', 'q-4'])
    // 3 .from() calls: lookup + bank insert + questions insert
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })

  it('returns question IDs mapped from the inserted rows', async () => {
    const questionIds = [{ id: 'q-a' }, { id: 'q-b' }, { id: 'q-c' }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'bank-abc' }, error: null }))
      .mockReturnValueOnce(buildChain({ data: questionIds, error: null }))

    const result = await seedQuestions({ ...BASE_OPTS, count: 3 })

    expect(result.questionIds).toHaveLength(3)
    expect(result.questionIds).toEqual(['q-a', 'q-b', 'q-c'])
  })

  it('throws with "seedBank lookup:" prefix when the bank lookup query fails', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'connection refused' } }),
    )

    await expect(seedQuestions(BASE_OPTS)).rejects.toThrow(/seedBank lookup:/)
  })

  it('throws with "seedBank:" prefix when the bank insert fails', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: null })) // lookup → not found
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'unique violation' } })) // insert fails

    await expect(seedQuestions(BASE_OPTS)).rejects.toThrow(/^seedBank:/)
  })

  it('throws with "seedQuestions:" prefix when the questions insert fails', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'bank-xyz' }, error: null })) // bank lookup OK
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'FK violation' } })) // questions insert fails

    await expect(seedQuestions(BASE_OPTS)).rejects.toThrow(/^seedQuestions:/)
  })
})

// ---------------------------------------------------------------------------
// cleanupReferenceData
// ---------------------------------------------------------------------------

// adminMock for cleanupReferenceData — only .from() needed (no auth calls).
const adminForCleanup = {
  from: mockFrom,
} as unknown as Parameters<typeof cleanupReferenceData>[0]['admin']

describe('cleanupReferenceData', () => {
  it('deletes subtopics, topics, and subjects in FK-safe order when all are present', async () => {
    // Three sequential .from() calls: subtopics delete → topics delete → subjects delete
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [{ id: 'st-1' }], error: null })) // subtopics
      .mockReturnValueOnce(buildChain({ data: [{ id: 't-1' }], error: null })) // topics
      .mockReturnValueOnce(buildChain({ data: [{ id: 's-1' }], error: null })) // subjects

    await cleanupReferenceData({
      admin: adminForCleanup,
      refs: [{ subjectId: 's-1', topicId: 't-1', subtopicId: 'st-1' }],
    })

    // All three tables touched in order: easa_subtopics, easa_topics, easa_subjects
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'easa_subtopics')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'easa_topics')
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'easa_subjects')
  })

  it('skips the subtopics delete when all subtopicIds are null', async () => {
    // Only two .from() calls: topics + subjects (no subtopics block)
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [{ id: 't-2' }], error: null })) // topics
      .mockReturnValueOnce(buildChain({ data: [{ id: 's-2' }], error: null })) // subjects

    await cleanupReferenceData({
      admin: adminForCleanup,
      refs: [{ subjectId: 's-2', topicId: 't-2', subtopicId: null }],
    })

    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'easa_topics')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'easa_subjects')
  })

  it('deduplicates ids so each table is deleted exactly once when multiple refs share IDs', async () => {
    // Two refs with the same subjectId and topicId (duplicate shared subject)
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [{ id: 'st-a' }, { id: 'st-b' }], error: null })) // subtopics (2 unique)
      .mockReturnValueOnce(buildChain({ data: [{ id: 't-shared' }], error: null })) // topics (1 unique)
      .mockReturnValueOnce(buildChain({ data: [{ id: 's-shared' }], error: null })) // subjects (1 unique)

    await cleanupReferenceData({
      admin: adminForCleanup,
      refs: [
        { subjectId: 's-shared', topicId: 't-shared', subtopicId: 'st-a' },
        { subjectId: 's-shared', topicId: 't-shared', subtopicId: 'st-b' },
      ],
    })

    // Still exactly 3 .from() calls — no duplicate table hits
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })

  it('does not log when zero rows are deleted (silent no-op)', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // subtopics — 0 rows
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // topics — 0 rows
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // subjects — 0 rows

    await cleanupReferenceData({
      admin: adminForCleanup,
      refs: [{ subjectId: 's-noop', topicId: 't-noop', subtopicId: 'st-noop' }],
    })

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('logs when rows are deleted', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    mockFrom
      .mockReturnValueOnce(buildChain({ data: [{ id: 'st-log' }], error: null })) // subtopics
      .mockReturnValueOnce(buildChain({ data: [{ id: 't-log' }], error: null })) // topics
      .mockReturnValueOnce(buildChain({ data: [{ id: 's-log' }], error: null })) // subjects

    await cleanupReferenceData({
      admin: adminForCleanup,
      refs: [{ subjectId: 's-log', topicId: 't-log', subtopicId: 'st-log' }],
    })

    expect(consoleSpy).toHaveBeenCalledTimes(3)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('easa_subtopic'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('easa_topic'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('easa_subject'))
    consoleSpy.mockRestore()
  })

  it('throws with "cleanupReferenceData subtopics:" prefix when the subtopics delete fails', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'subtopics FK violation' } }),
    )

    await expect(
      cleanupReferenceData({
        admin: adminForCleanup,
        refs: [{ subjectId: 's-err', topicId: 't-err', subtopicId: 'st-err' }],
      }),
    ).rejects.toThrow(/cleanupReferenceData subtopics:/)
  })

  it('throws with "cleanupReferenceData topics:" prefix when the topics delete fails', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // subtopics OK
      .mockReturnValueOnce(
        buildChain({ data: null, error: { message: 'topics constraint' } }),
      ) // topics fails

    await expect(
      cleanupReferenceData({
        admin: adminForCleanup,
        refs: [{ subjectId: 's-err2', topicId: 't-err2', subtopicId: 'st-err2' }],
      }),
    ).rejects.toThrow(/cleanupReferenceData topics:/)
  })

  it('throws with "cleanupReferenceData subjects:" prefix when the subjects delete fails', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // subtopics OK
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // topics OK
      .mockReturnValueOnce(
        buildChain({ data: null, error: { message: 'subjects timeout' } }),
      ) // subjects fails

    await expect(
      cleanupReferenceData({
        admin: adminForCleanup,
        refs: [{ subjectId: 's-err3', topicId: 't-err3', subtopicId: 'st-err3' }],
      }),
    ).rejects.toThrow(/cleanupReferenceData subjects:/)
  })

  it('no-ops when every ref is undefined (beforeAll-failed afterAll guard)', async () => {
    // A describe-scoped `let refs` is undefined if beforeAll throws before assigning it;
    // vitest still runs afterAll. The helper must not crash on undefined entries.
    await cleanupReferenceData({ admin: adminForCleanup, refs: [undefined] })

    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('cleans defined refs and skips undefined entries (partial beforeAll failure)', async () => {
    // Multi-ref case where an early seed succeeded but a later one threw:
    // [definedRef, undefined]. The defined ref is still cleaned; the undefined is dropped.
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [{ id: 'st-p' }], error: null })) // subtopics
      .mockReturnValueOnce(buildChain({ data: [{ id: 't-p' }], error: null })) // topics
      .mockReturnValueOnce(buildChain({ data: [{ id: 's-p' }], error: null })) // subjects

    await cleanupReferenceData({
      admin: adminForCleanup,
      refs: [{ subjectId: 's-p', topicId: 't-p', subtopicId: 'st-p' }, undefined],
    })

    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'easa_subtopics')
  })
})
