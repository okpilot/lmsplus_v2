import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// seed.ts calls requireEnv() indirectly via setup.ts at module scope — the env
// vars must be present before any module in this tree is imported. vi.hoisted
// runs before any import, so we set them here.
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
import { seedQuestions, seedReferenceData } from './seed'

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

// Minimal admin mock shared by both seedQuestions and seedReferenceData describe
// blocks: only `.from()` is needed — neither calls auth methods.
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

  it('throws "unexpected response shape" when the insert returns a non-array with no error', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'bank-xyz' }, error: null })) // bank lookup OK
      .mockReturnValueOnce(buildChain({ data: null, error: null })) // insert: null data, no error

    await expect(seedQuestions(BASE_OPTS)).rejects.toThrow(/unexpected response shape/)
  })
})

// ---------------------------------------------------------------------------
// Base opts for seedReferenceData
// ---------------------------------------------------------------------------
const REF_OPTS = {
  admin: adminMock,
  subjectCode: 'MET',
  subjectName: 'Meteorology',
  topicCode: 'MET-01',
  topicName: 'Atmosphere',
}

describe('seedReferenceData', () => {
  it('returns all three ids and makes 3 .from() calls when subtopic is provided', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'subj-uuid-1' }, error: null })) // easa_subjects upsert
      .mockReturnValueOnce(buildChain({ data: { id: 'topic-uuid-1' }, error: null })) // easa_topics upsert
      .mockReturnValueOnce(buildChain({ data: { id: 'subtopic-uuid-1' }, error: null })) // easa_subtopics upsert

    const result = await seedReferenceData({
      ...REF_OPTS,
      subtopicCode: 'MET-01-01',
      subtopicName: 'Composition',
    })

    expect(result.subjectId).toBe('subj-uuid-1')
    expect(result.topicId).toBe('topic-uuid-1')
    expect(result.subtopicId).toBe('subtopic-uuid-1')
    expect(mockFrom).toHaveBeenCalledTimes(3)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'easa_subjects')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'easa_topics')
    expect(mockFrom).toHaveBeenNthCalledWith(3, 'easa_subtopics')
  })

  it('returns subtopicId null and makes 2 .from() calls when subtopic is omitted', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'subj-uuid-2' }, error: null })) // easa_subjects upsert
      .mockReturnValueOnce(buildChain({ data: { id: 'topic-uuid-2' }, error: null })) // easa_topics upsert

    const result = await seedReferenceData(REF_OPTS)

    expect(result.subjectId).toBe('subj-uuid-2')
    expect(result.topicId).toBe('topic-uuid-2')
    expect(result.subtopicId).toBeNull()
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'easa_subjects')
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'easa_topics')
  })

  it('returns subtopicId null when only subtopicCode is provided without subtopicName', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'subj-uuid-3' }, error: null }))
      .mockReturnValueOnce(buildChain({ data: { id: 'topic-uuid-3' }, error: null }))

    const result = await seedReferenceData({ ...REF_OPTS, subtopicCode: 'MET-01-01' })

    expect(result.subtopicId).toBeNull()
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('throws with "seedSubject:" prefix when the subject upsert fails', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'unique violation on code' } }),
    )

    await expect(seedReferenceData(REF_OPTS)).rejects.toThrow(/^seedSubject:/)
  })

  it('throws with "seedTopic:" prefix when the topic upsert fails', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'subj-uuid-4' }, error: null })) // subject OK
      .mockReturnValueOnce(
        buildChain({ data: null, error: { message: 'FK constraint failed' } }),
      ) // topic fails

    await expect(seedReferenceData(REF_OPTS)).rejects.toThrow(/^seedTopic:/)
  })

  it('throws with "seedSubtopic:" prefix when the subtopic upsert fails', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ data: { id: 'subj-uuid-5' }, error: null })) // subject OK
      .mockReturnValueOnce(buildChain({ data: { id: 'topic-uuid-5' }, error: null })) // topic OK
      .mockReturnValueOnce(
        buildChain({ data: null, error: { message: 'unique violation on topic_id,code' } }),
      ) // subtopic fails

    await expect(
      seedReferenceData({ ...REF_OPTS, subtopicCode: 'MET-01-01', subtopicName: 'Composition' }),
    ).rejects.toThrow(/^seedSubtopic:/)
  })
})
