import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickSubjectWithQuestions } from './seed'

// ---------------------------------------------------------------------------
// Supabase mock — prevents the real createClient call (which requires env
// vars and a live DB) from running during unit tests.
// ---------------------------------------------------------------------------

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

// buildChain returns a Proxy that forwards every method call back to itself,
// and resolves to `returnValue` when awaited. This mirrors the project-wide
// pattern (see proxy.test.ts) and handles arbitrarily-long Supabase chains
// (.select().eq().is().order() etc.) without manually mocking every step.
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

// Typed fixture rows
type SubjectRow = { id: string; code: string }
type TopicRow = { id: string; sort_order: number }

// Convenience: a subject count response that meets the default threshold.
const COUNT_PASS = { count: 5, error: null }
// A subject count response that fails to meet the threshold.
const COUNT_FAIL = { count: 0, error: null }

// The admin client produced by getAdminClient() in seed.ts.
// Because we mocked @supabase/supabase-js above, every call to
// createClient() returns { from: mockFrom }. We pass that object directly
// to pickSubjectWithQuestions as `admin`.
const adminMock = { from: mockFrom } as unknown as Parameters<
  typeof pickSubjectWithQuestions
>[0]

const ORG_ID = 'org-uuid-0001'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('pickSubjectWithQuestions', () => {
  it('returns the first subject and first topic that meet the default thresholds', async () => {
    const subjects: SubjectRow[] = [{ id: 'subj-1', code: 'A' }]
    const topics: TopicRow[] = [{ id: 'topic-1', sort_order: 1 }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: subjects, error: null })) // subjects list
      .mockReturnValueOnce(buildChain(COUNT_PASS)) // subject question count
      .mockReturnValueOnce(buildChain({ data: topics, error: null })) // topics list
      .mockReturnValueOnce(buildChain(COUNT_PASS)) // topic question count

    const result = await pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })

    expect(result).toEqual({ subjectId: 'subj-1', subjectCode: 'A', topicId: 'topic-1' })
  })

  it('skips subjects whose active question count is below the threshold', async () => {
    const subjects: SubjectRow[] = [
      { id: 'subj-empty', code: '080' }, // zero questions — should be skipped
      { id: 'subj-full', code: '081' }, // has questions — should be picked
    ]
    const topics: TopicRow[] = [{ id: 'topic-2', sort_order: 1 }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: subjects, error: null })) // subjects list
      .mockReturnValueOnce(buildChain(COUNT_FAIL)) // subj-empty count → skip
      .mockReturnValueOnce(buildChain(COUNT_PASS)) // subj-full count → proceed
      .mockReturnValueOnce(buildChain({ data: topics, error: null })) // topics for subj-full
      .mockReturnValueOnce(buildChain(COUNT_PASS)) // topic count for topic-2

    const result = await pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })

    expect(result.subjectId).toBe('subj-full')
    expect(result.topicId).toBe('topic-2')
  })

  it('throws when no subject in the org meets the threshold', async () => {
    const subjects: SubjectRow[] = [
      { id: 'subj-a', code: '080' },
      { id: 'subj-b', code: '082' },
    ]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: subjects, error: null }))
      .mockReturnValueOnce(buildChain(COUNT_FAIL)) // subj-a count → skip
      .mockReturnValueOnce(buildChain(COUNT_FAIL)) // subj-b count → skip

    await expect(pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })).rejects.toThrow(
      /no subject in org/,
    )
  })

  it('throws when the subject has questions but no topic meets the topic threshold', async () => {
    const subjects: SubjectRow[] = [{ id: 'subj-1', code: 'A' }]
    const topics: TopicRow[] = [{ id: 'topic-x', sort_order: 1 }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: subjects, error: null })) // subjects list
      .mockReturnValueOnce(buildChain(COUNT_PASS)) // subject count passes
      .mockReturnValueOnce(buildChain({ data: topics, error: null })) // topics list
      .mockReturnValueOnce(buildChain(COUNT_FAIL)) // topic count fails — all topics exhausted

    await expect(pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })).rejects.toThrow(
      /no subject in org/,
    )
  })

  it('uses default thresholds of 1 and 1 when no options are provided', async () => {
    // COUNT_PASS has count: 5. With default threshold (1), this must pass.
    const subjects: SubjectRow[] = [{ id: 'subj-default', code: 'Z' }]
    const topics: TopicRow[] = [{ id: 'topic-default', sort_order: 1 }]

    mockFrom
      .mockReturnValueOnce(buildChain({ data: subjects, error: null }))
      .mockReturnValueOnce(buildChain({ count: 1, error: null })) // exactly at threshold
      .mockReturnValueOnce(buildChain({ data: topics, error: null }))
      .mockReturnValueOnce(buildChain({ count: 1, error: null })) // exactly at threshold

    const result = await pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })

    expect(result.subjectId).toBe('subj-default')
    expect(result.topicId).toBe('topic-default')
  })

  it('throws a descriptive message when no subjects exist in the org', async () => {
    mockFrom.mockReturnValueOnce(buildChain({ data: [], error: null }))

    await expect(pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })).rejects.toThrow(
      /no subjects found in org/,
    )
  })

  it('throws when the subjects query fails', async () => {
    mockFrom.mockReturnValueOnce(
      buildChain({ data: null, error: { message: 'connection refused' } }),
    )

    await expect(pickSubjectWithQuestions(adminMock, { orgId: ORG_ID })).rejects.toThrow(
      /pickSubjectWithQuestions subjects/,
    )
  })
})
