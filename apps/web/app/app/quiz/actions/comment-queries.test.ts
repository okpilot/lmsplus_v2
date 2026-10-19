import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

const mockSupabase = {
  from: mockFrom,
} as unknown as import('@supabase/supabase-js').SupabaseClient<import('@repo/db/types').Database>

// ---- Subject under test ----------------------------------------------------

import { COMMENT_SELECT, fetchQuestionComments } from './comment-queries'

// ---- Helpers ---------------------------------------------------------------

const rangeCalls: Array<[number, number]> = []
const selectCalls: unknown[][] = []

/** Fluent Supabase chain; `.range()` records its args, awaiting resolves to returnValue. */
function buildChain(returnValue: unknown) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      if (prop === 'select') {
        return (...args: unknown[]) => {
          selectCalls.push(args)
          return buildChain(returnValue)
        }
      }
      if (prop === 'range') {
        return (from: number, to: number) => {
          rangeCalls.push([from, to])
          return buildChain(returnValue)
        }
      }
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

function rows(n: number, prefix = 'row') {
  return Array.from({ length: n }, (_, i) => ({ ...COMMENT_ROW, id: `${prefix}-${i}` }))
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
    rangeCalls.length = 0
    selectCalls.length = 0
  })

  it('reads up to 1000 comments in a single query', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 1, data: [COMMENT_ROW], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [COMMENT_ROW], error: null })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(rangeCalls).toEqual([[0, 999]])
  })

  it('returns an empty array in one query when the question has no comments', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 0, data: [], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [], error: null })
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('fetches only the remaining comments without re-reading the first page', async () => {
    const firstPage = rows(1000, 'a')
    const tail = rows(1, 'b')
    mockFrom
      .mockReturnValueOnce(buildChain({ count: 1001, data: firstPage, error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: tail, error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [...firstPage, ...tail], error: null })
    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1000],
    ])
    expect(selectCalls).toEqual([
      [COMMENT_SELECT, { count: 'exact' }],
      [COMMENT_SELECT, undefined],
    ])
  })

  it('surfaces the error and returns no rows when the first query fails', async () => {
    mockFrom.mockReturnValue(buildChain({ count: null, data: null, error: { message: 'boom' } }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [], error: { message: 'boom' } })
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('surfaces an error when the first query reports no exact count', async () => {
    mockFrom.mockReturnValue(buildChain({ count: null, data: [COMMENT_ROW], error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({
      data: [],
      error: { message: 'fetchAllRows: count query returned no exact count' },
    })
  })

  it('surfaces an error when the count reports rows but the first page resolves null', async () => {
    mockFrom.mockReturnValue(buildChain({ count: 3, data: null, error: null }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({
      data: [],
      error: { message: 'question_comments: expected an array, got null' },
    })
  })

  it('surfaces a page-level error after the count succeeds', async () => {
    mockFrom
      .mockReturnValueOnce(buildChain({ count: 1001, data: rows(1000), error: null }))
      .mockReturnValueOnce(buildChain({ count: null, data: null, error: { message: 'page fail' } }))

    const result = await fetchQuestionComments(mockSupabase, QUESTION_ID)

    expect(result).toEqual({ data: [], error: { message: 'page fail' } })
  })
})
