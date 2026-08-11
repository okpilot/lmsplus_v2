import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { fetchActiveQuestionCounts } from './quiz-question-counts'

// The helper only forwards this to rpc(), which is mocked — no client methods are called.
const supabase = {} as Awaited<
  ReturnType<typeof import('@repo/db/server').createServerSupabaseClient>
>

describe('fetchActiveQuestionCounts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('requests only active questions', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await fetchActiveQuestionCounts(supabase)

    expect(mockRpc).toHaveBeenCalledWith(supabase, 'get_question_counts', { p_status: 'active' })
  })

  it('returns the counts rows when the read succeeds', async () => {
    const rows = [{ subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 3 }]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual(rows)
  })

  it('passes a bigint count through untouched so the caller can coerce it', async () => {
    // PostgREST may serialize COUNT(*) as a string; the helper must not silently coerce,
    // because every call site applies Number() at the point it builds its count map.
    const rows = [{ subject_id: 's1', topic_id: 't1', subtopic_id: null, n: '42' }]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual(rows)
  })

  it('degrades to an empty list and logs when the read fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc boom' } })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] get_question_counts error:',
      'rpc boom',
    )
  })

  it('degrades to an empty list when the payload is not an array', async () => {
    // rpc() casts without validating shape, so a non-array payload would otherwise reach
    // the callers' `for (const row of countsData)` loops and throw at runtime.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: { unexpected: 'shape' }, error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] payload is not an array:',
      'object',
    )
  })

  it('degrades to an empty list when the payload is null without an error', async () => {
    // Distinct from the case above: `typeof null` is also 'object', so the helper reports the
    // literal 'null' to keep "the RPC returned nothing" separable from "the shape drifted".
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: null, error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] payload is not an array:',
      'null',
    )
  })

  it('drops a row whose count is not a numeric value', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 'abc' }],
      error: null,
    })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
  })

  it('drops a row that is missing its topic id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', subtopic_id: null, n: 3 }],
      error: null,
    })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
  })

  it('drops a row whose subtopic id is not a text value', async () => {
    // The consumer gates only on `!== null` before using this as a Map key
    // (quiz-subject-queries.ts:165-171), so a non-string here must not reach it.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: [{ subject_id: 's1', topic_id: 't1', subtopic_id: 42, n: 3 }],
      error: null,
    })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
  })

  it('returns an empty list when every row has an unexpected shape', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: [null], error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
  })

  it('keeps the valid rows when only some rows have an unexpected shape', async () => {
    // One drifted row must cost one count, not the whole picker — every caller filters on
    // `questionCount > 0`, so discarding the payload would blank the entire subject list.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const valid = { subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 3 }
    mockRpc.mockResolvedValue({ data: [valid, { subject_id: 's2' }], error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([valid])
  })

  it('logs how many rows it dropped', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const valid = { subject_id: 's1', topic_id: 't1', subtopic_id: null, n: 3 }
    mockRpc.mockResolvedValue({ data: [valid, null, { subject_id: 's2' }], error: null })

    await fetchActiveQuestionCounts(supabase)

    expect(consoleSpy).toHaveBeenCalledWith(
      '[fetchActiveQuestionCounts] dropped 2 of 3 malformed row(s)',
    )
  })
})
