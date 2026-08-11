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
    mockRpc.mockResolvedValue({ data: { unexpected: 'shape' }, error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
  })

  it('degrades to an empty list when the payload is null without an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    await expect(fetchActiveQuestionCounts(supabase)).resolves.toEqual([])
  })
})
