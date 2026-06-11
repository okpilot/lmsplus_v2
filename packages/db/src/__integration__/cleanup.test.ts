import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// cleanup.ts does not call requireEnv() at module scope, but cleanup.test.ts
// may co-load setup.ts indirectly (Vitest module graph). Set env vars here
// via vi.hoisted to be safe — runs before any import.
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
import { cleanupReferenceData, cleanupTestData } from './cleanup'

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

beforeEach(() => {
  vi.resetAllMocks()
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
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'topics constraint' } })) // topics fails

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
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'subjects timeout' } })) // subjects fails

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

// ---------------------------------------------------------------------------
// cleanupTestData
// ---------------------------------------------------------------------------

// adminMock for cleanupTestData — needs .from() AND auth.admin.deleteUser.
const mockDeleteUser = vi.hoisted(() => vi.fn())
const adminForTestData = {
  from: mockFrom,
  auth: { admin: { deleteUser: mockDeleteUser } },
} as unknown as Parameters<typeof cleanupTestData>[0]['admin']

describe('cleanupTestData', () => {
  // The from() call order in cleanupTestData: audit_events, fsrs_cards,
  // student_responses, quiz_sessions (id lookup), quiz_session_answers,
  // quiz_sessions (delete), questions, question_banks, exam_configs, users, organizations.
  function queueAllDeletesOk() {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // audit_events
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // fsrs_cards
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // student_responses
      .mockReturnValueOnce(buildChain({ data: [{ id: 'sess-1' }], error: null })) // quiz_sessions lookup
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // quiz_session_answers
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // quiz_sessions delete
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // question_banks
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // exam_configs
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // users
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // organizations
  }

  it('deletes in FK-safe order and removes each auth user', async () => {
    queueAllDeletesOk()
    mockDeleteUser.mockResolvedValue({ error: null })

    await cleanupTestData({ admin: adminForTestData, orgId: 'org-1', userIds: ['u-1', 'u-2'] })

    expect(mockFrom).toHaveBeenNthCalledWith(1, 'audit_events')
    expect(mockFrom).toHaveBeenNthCalledWith(4, 'quiz_sessions') // id lookup before child delete
    expect(mockFrom).toHaveBeenNthCalledWith(5, 'quiz_session_answers')
    expect(mockFrom).toHaveBeenNthCalledWith(9, 'exam_configs') // exam_configs before users/org
    expect(mockFrom).toHaveBeenNthCalledWith(11, 'organizations') // org deleted last
    expect(mockDeleteUser).toHaveBeenCalledTimes(2)
    expect(mockDeleteUser).toHaveBeenNthCalledWith(1, 'u-1')
    expect(mockDeleteUser).toHaveBeenNthCalledWith(2, 'u-2')
  })

  it('throws when the quiz_sessions id lookup fails (cannot scope child delete)', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // audit_events
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // fsrs_cards
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // student_responses
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'lookup boom' } })) // lookup fails

    await expect(
      cleanupTestData({ admin: adminForTestData, orgId: 'org-1', userIds: ['u-1'] }),
    ).rejects.toThrow(/cleanupTestData: quiz_sessions lookup failed/)
  })

  it('logs and continues (does not throw) when a table delete errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: { message: 'audit boom' } })) // audit_events fails
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // fsrs_cards
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // student_responses
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // quiz_sessions lookup
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // quiz_session_answers
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // quiz_sessions delete
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // questions
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // question_banks
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // exam_configs
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // users
      .mockReturnValueOnce(buildChain({ data: [], error: null })) // organizations

    await expect(
      cleanupTestData({ admin: adminForTestData, orgId: 'org-1', userIds: [] }),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('audit_events delete failed'))
    consoleSpy.mockRestore()
  })

  it('logs and continues when an auth user deletion errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    queueAllDeletesOk()
    mockDeleteUser.mockResolvedValue({ error: { message: 'gotrue boom' } })

    await expect(
      cleanupTestData({ admin: adminForTestData, orgId: 'org-1', userIds: ['u-1'] }),
    ).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('auth user u-1 delete failed'))
    consoleSpy.mockRestore()
  })
})
