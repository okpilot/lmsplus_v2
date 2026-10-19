import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

const mockSupabase = {
  from: mockFrom,
} as unknown as import('@supabase/supabase-js').SupabaseClient<import('@repo/db/types').Database>

// ---- Subject under test ----------------------------------------------------

import { fetchQuestionComments } from './comment-queries'

// ---- Helpers ---------------------------------------------------------------

/**
 * Builds a fluent Supabase chain that resolves to the given return value.
 * fetchAllRows calls getCount (reads `count`) then getPage (reads `data`).
 * We return a single object carrying BOTH so one chain mock serves both calls.
 */
function buildChain(returnValue: unknown) {
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

// ---- Fixtures --------------------------------------------------------------

const USER_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const COMMENT_ID = '00000000-0000-4000-a000-000000000099'

const COMMENT_ROW = {
  id: COMMENT_ID,
  question_id: QUESTION_ID,
  user_id: USER_ID,
  body: 'Great question about altimetry.',
  created_at: '2026-03-20T10:00:00Z',
  users: { full_name: 'Alice Pilot', role: 'student' },
}

// ---- Tests -----------------------------------------------------------------

describe('fetchQuestionComments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns all comments in one query when the count equals the rows returned', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 1, data: [COMMENT_ROW], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [COMMENT_ROW], error: null })
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array in one query when the question has no comments', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 0, data: [], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [], error: null })
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('reads the count and pages separately when the count exceeds the first page', async () => {
    const pagedRows = [COMMENT_ROW, { ...COMMENT_ROW, id: 'paged-2' }]
    mockFrom
      .mockReturnValueOnce(buildChain({ count: 2, data: [COMMENT_ROW], error: null }))
      .mockReturnValueOnce(buildChain({ count: 2, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: pagedRows, error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: pagedRows, error: null })
  })

  it('falls back to the paged read when the first query errors', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ count: null, data: null, error: { message: 'first' } }))
      .mockReturnValueOnce(buildChain({ count: 1, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: [COMMENT_ROW], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [COMMENT_ROW], error: null })
  })

  it('falls back to the paged read when the first query reports no count', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ count: null, data: [COMMENT_ROW], error: null }))
      .mockReturnValueOnce(buildChain({ count: 1, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: [COMMENT_ROW], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [COMMENT_ROW], error: null })
    expect(mockFrom).toHaveBeenCalledTimes(3)
  })

  it('surfaces a database error and returns no rows', async () => {
    mockFrom.mockReturnValue(buildChain({ count: null, data: null, error: { message: 'boom' } }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [], error: { message: 'boom' } })
  })

  it('surfaces an error when the count reports rows but a page resolves null', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ count: 3, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: 3, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: null, error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({
      data: [],
      error: { message: 'question_comments: expected an array, got null' },
    })
  })

  it('surfaces a page-level error after the count succeeds', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ count: 3, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: 3, data: null, error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: null, error: { message: 'page fail' } }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [], error: { message: 'page fail' } })
  })
})
