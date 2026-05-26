import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchUserSessionAnswers } from './collect-user-data-queries'

// ---- helpers ---------------------------------------------------------------

type AnswerRow = {
  session_id: string
  question_id: string
  selected_option_id: string
  is_correct: boolean
  response_time_ms: number
  answered_at: string
}

function makeAnswer(sessionId: string, index: number): AnswerRow {
  return {
    session_id: sessionId,
    question_id: `q-${index}`,
    selected_option_id: `opt-${index}`,
    is_correct: index % 2 === 0,
    response_time_ms: 1000,
    answered_at: '2026-03-01T10:00:00Z',
  }
}

// fetchUserSessionAnswers chunks sessionIds into batches of 1000 and delegates each batch to
// fetchAllRows. Mock fetchAllRows so we can assert the batch count + accumulation without
// building a full Supabase proxy chain.
const { mockFetchAllRows } = vi.hoisted(() => ({ mockFetchAllRows: vi.fn() }))

vi.mock('@/lib/supabase-paginate', () => ({
  fetchAllRows: mockFetchAllRows,
}))

const fakeClient = {} as unknown as SupabaseClient<Database>

// ---- tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchUserSessionAnswers', () => {
  it('returns empty data immediately when sessionIds is empty', async () => {
    const result = await fetchUserSessionAnswers(fakeClient, [])

    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
    expect(mockFetchAllRows).not.toHaveBeenCalled()
  })

  it('issues a single fetchAllRows call when sessionIds fit in one batch of 1000', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `sess-${i}`)
    mockFetchAllRows.mockResolvedValueOnce({ data: [makeAnswer('sess-0', 0)], error: null })

    const result = await fetchUserSessionAnswers(fakeClient, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(1)
    expect(result.data).toHaveLength(1)
    expect(result.error).toBeNull()
  })

  it('issues two fetchAllRows calls when sessionIds just exceed one batch (1001 ids)', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `sess-${i}`)
    mockFetchAllRows
      .mockResolvedValueOnce({ data: [makeAnswer('sess-0', 0)], error: null })
      .mockResolvedValueOnce({ data: [makeAnswer('sess-1000', 1)], error: null })

    await fetchUserSessionAnswers(fakeClient, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(2)
  })

  it('splits 2500 sessionIds into 3 batches and accumulates all answers', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `sess-${i}`)
    mockFetchAllRows
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => makeAnswer(`sess-${i}`, i)),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => makeAnswer(`sess-${i + 1000}`, i)),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, i) => makeAnswer(`sess-${i + 2000}`, i)),
        error: null,
      })

    const result = await fetchUserSessionAnswers(fakeClient, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(3)
    expect(result.data).toHaveLength(2500)
    expect(result.error).toBeNull()
  })

  it('issues two fetchAllRows calls for 1500 sessionIds', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `sess-${i}`)
    mockFetchAllRows
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })

    await fetchUserSessionAnswers(fakeClient, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(2)
  })

  it('returns empty data and the error when a batch query fails, discarding partial results', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `sess-${i}`)
    // First batch succeeds, second batch fails.
    mockFetchAllRows
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => makeAnswer(`sess-${i}`, i)),
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: { message: 'batch-2 timeout' } })

    const result = await fetchUserSessionAnswers(fakeClient, ids)

    // Partial accumulation from batch 1 is discarded; the error is surfaced; batch 3 is skipped.
    expect(result.data).toEqual([])
    expect(result.error).toEqual({ message: 'batch-2 timeout' })
    expect(mockFetchAllRows).toHaveBeenCalledTimes(2)
  })

  it('returns all accumulated answers when the last batch is exactly 1000 rows', async () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `sess-${i}`)
    mockFetchAllRows
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => makeAnswer(`sess-${i}`, i)),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => makeAnswer(`sess-${i + 1000}`, i)),
        error: null,
      })

    const result = await fetchUserSessionAnswers(fakeClient, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(2)
    expect(result.data).toHaveLength(2000)
    expect(result.error).toBeNull()
  })
})
