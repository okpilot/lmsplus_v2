import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AnswerRow,
  fetchCourseEnrolments,
  fetchExamSittingCandidacies,
  fetchExamSittingEntries,
  fetchStudentGroupMemberships,
  fetchUserAuditEvents,
  fetchUserComments,
  fetchUserConsents,
  fetchUserFlaggedQuestions,
  fetchUserFsrsCards,
  fetchUserResponses,
  fetchUserSessionAnswers,
  fetchUserSessions,
} from './collect-user-data-queries'

// ---- helpers ---------------------------------------------------------------

function makeAnswer(sessionId: string, index: number): AnswerRow {
  return {
    session_id: sessionId,
    question_id: `q-${index}`,
    selected_option_id: `opt-${index}`,
    response_text: null,
    blank_index: null,
    is_correct: index % 2 === 0,
    response_time_ms: 1000,
    answered_at: '2026-03-01T10:00:00Z',
  }
}

// fetchUserSessionAnswers chunks sessionIds into batches of 1000 and delegates each batch to
// fetchAllRows. Mock fetchAllRows so we can assert the batch count + accumulation without
// building a full Supabase proxy chain.
const { mockFetchAllRows } = vi.hoisted(() => ({ mockFetchAllRows: vi.fn() }))

// Spread the real module: Vitest THROWS on a mock that omits an export a consumer
// touches — it does not silently yield undefined. Preventive here: the module under
// test reads no other export from supabase-paginate today, so a bare { fetchAllRows }
// mock still passes. The spread keeps that true if its graph later reaches one.
vi.mock('@/lib/supabase-paginate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase-paginate')>()),
  fetchAllRows: mockFetchAllRows,
}))

const fakeClient = {} as unknown as SupabaseClient<Database>

// ---- tests -----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchCourseEnrolments', () => {
  it('filters course_enrolments by user_id for the count and the page query', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })
    const eq = vi.fn()
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'range']) builder[m] = vi.fn(() => builder)
    builder.eq = (...a: unknown[]) => {
      eq(...a)
      return builder
    }
    const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient<Database>

    await fetchCourseEnrolments(client, USER_ID)
    const [getCount, getPage] = mockFetchAllRows.mock.calls[0] as [
      () => unknown,
      (a: number, b: number) => unknown,
    ]
    getCount()
    getPage(0, 9)

    expect(eq.mock.calls).toEqual([
      ['user_id', USER_ID],
      ['user_id', USER_ID],
    ])
  })
})

describe('fetchStudentGroupMemberships', () => {
  it('reads student_group_members for the user with the group name, newest first', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })
    const eq = vi.fn()
    const select = vi.fn()
    const order = vi.fn()
    const builder: Record<string, unknown> = {}
    builder.select = (...a: unknown[]) => {
      select(...a)
      return builder
    }
    builder.eq = (...a: unknown[]) => {
      eq(...a)
      return builder
    }
    builder.order = (...a: unknown[]) => {
      order(...a)
      return builder
    }
    builder.range = vi.fn(() => builder)
    const from = vi.fn(() => builder)
    const client = { from } as unknown as SupabaseClient<Database>

    await fetchStudentGroupMemberships(client, USER_ID)
    const [getCount, getPage] = mockFetchAllRows.mock.calls[0] as [
      () => unknown,
      (a: number, b: number) => unknown,
    ]
    getCount()
    getPage(0, 9)

    expect(from).toHaveBeenCalledWith('student_group_members')
    expect(eq.mock.calls).toEqual([
      ['user_id', USER_ID],
      ['user_id', USER_ID],
    ])
    const pageSelect = String(select.mock.calls[1]?.[0])
    expect(pageSelect).toContain('group_id')
    expect(pageSelect).toContain('deleted_at')
    expect(pageSelect).toContain(
      'student_groups!student_group_members_group_id_organization_id_fkey(name)',
    )
    expect(order).toHaveBeenCalledWith('added_at', { ascending: false })
  })
})

function recordingClient() {
  const eq = vi.fn()
  const select = vi.fn()
  const order = vi.fn()
  const builder: Record<string, unknown> = {}
  builder.select = (...a: unknown[]) => {
    select(...a)
    return builder
  }
  builder.eq = (...a: unknown[]) => {
    eq(...a)
    return builder
  }
  builder.order = (...a: unknown[]) => {
    order(...a)
    return builder
  }
  builder.range = vi.fn(() => builder)
  const from = vi.fn(() => builder)
  const client = { from } as unknown as SupabaseClient<Database>
  return { client, from, eq, select, order }
}

function runCountAndPage() {
  const [getCount, getPage] = mockFetchAllRows.mock.calls[0] as [
    () => unknown,
    (a: number, b: number) => unknown,
  ]
  getCount()
  getPage(0, 9)
}

describe('fetchExamSittingCandidacies', () => {
  it('reads exam_sitting_candidates for the user with the sitting embed, newest first then by id', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })
    const { client, from, eq, select, order } = recordingClient()

    await fetchExamSittingCandidacies(client, USER_ID)
    runCountAndPage()

    expect(from).toHaveBeenCalledWith('exam_sitting_candidates')
    expect(eq.mock.calls).toEqual([
      ['user_id', USER_ID],
      ['user_id', USER_ID],
    ])
    const pageSelect = String(select.mock.calls[1]?.[0]).replace(/\s+/g, '')
    expect(pageSelect).toBe(
      'sitting_id,added_at,deleted_at,exam_sittings!exam_sitting_candidates_sitting_id_organization_id_fkey(scheduled_at,mode,status)',
    )
    expect(order.mock.calls).toEqual([['added_at', { ascending: false }], ['id']])
  })
})

describe('fetchExamSittingEntries', () => {
  it('reads exam_sitting_entries for the user with granted columns only, newest first then by id', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: null })
    const { client, from, eq, select, order } = recordingClient()

    await fetchExamSittingEntries(client, USER_ID)
    runCountAndPage()

    expect(from).toHaveBeenCalledWith('exam_sitting_entries')
    expect(eq.mock.calls).toEqual([
      ['user_id', USER_ID],
      ['user_id', USER_ID],
    ])
    expect(String(select.mock.calls[1]?.[0]).replace(/\s+/g, '')).toBe(
      'sitting_id,subject_id,added_at,deleted_at',
    )
    expect(order.mock.calls).toEqual([['added_at', { ascending: false }], ['id']])
  })
})

describe('fetchUserSessionAnswers', () => {
  it('returns empty data immediately when sessionIds is empty', async () => {
    const result = await fetchUserSessionAnswers(fakeClient, [])

    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
    expect(mockFetchAllRows).not.toHaveBeenCalled()
  })

  it('fetches answers in a single batch when sessionIds fit within 1000', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `sess-${i}`)
    mockFetchAllRows.mockResolvedValueOnce({ data: [makeAnswer('sess-0', 0)], error: null })

    const result = await fetchUserSessionAnswers(fakeClient, ids)

    expect(mockFetchAllRows).toHaveBeenCalledTimes(1)
    expect(result.data).toHaveLength(1)
    expect(result.error).toBeNull()
  })

  it('splits sessionIds into multiple batches when they exceed 1000 (1001 ids)', async () => {
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

  it('splits 1500 sessionIds across multiple batches', async () => {
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

// ---------------------------------------------------------------------------
// Page-error propagation tests for the seven simple fetchUser* functions
// (code-style.md §7 "Paginated Fetch Needs a Caller-Level Page-Error Test").
//
// These tests use the module-level mockFetchAllRows mock. Each test simulates
// the page-error path: fetchAllRows returns { data: [], error } (which is what
// it returns when a page query fails after a successful count — see
// supabase-paginate.test.ts for the full internal path). The caller-level
// assertion is that the error propagates unchanged and data is empty.
// ---------------------------------------------------------------------------

const USER_ID = 'bbbbbbbb-0000-4000-b000-000000000001'

const PAGE_ERROR = { message: 'page-level DB timeout' }

// All eight are pure `return fetchAllRows(...)` pass-throughs, so one parameterized
// suite proves the shared propagation contract (the function name is in describe()).
describe.each([
  ['fetchUserSessions', fetchUserSessions],
  ['fetchUserResponses', fetchUserResponses],
  ['fetchUserFsrsCards', fetchUserFsrsCards],
  ['fetchUserFlaggedQuestions', fetchUserFlaggedQuestions],
  ['fetchUserComments', fetchUserComments],
  ['fetchUserConsents', fetchUserConsents],
  ['fetchUserAuditEvents', fetchUserAuditEvents],
  ['fetchCourseEnrolments', fetchCourseEnrolments],
  ['fetchStudentGroupMemberships', fetchStudentGroupMemberships],
  ['fetchExamSittingCandidacies', fetchExamSittingCandidacies],
  ['fetchExamSittingEntries', fetchExamSittingEntries],
] as const)('%s', (_name, fetchFn) => {
  it('surfaces a page-fetch error as { data: [], error } when count succeeds but page fails', async () => {
    mockFetchAllRows.mockResolvedValueOnce({ data: [], error: PAGE_ERROR })

    const result = await fetchFn(fakeClient, USER_ID)

    expect(result).toEqual({ data: [], error: PAGE_ERROR })
  })
})
