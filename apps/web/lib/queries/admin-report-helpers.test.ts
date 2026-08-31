import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChainableRpcClient } from '@/lib/test-support/chainable-rpc-client'

// ---- Mocks ------------------------------------------------------------------

const mockAdminFrom = vi.hoisted(() => vi.fn())

vi.mock('@repo/db/admin', () => ({
  adminClient: { from: mockAdminFrom },
}))

// ---- Subject under test ------------------------------------------------------

import {
  fetchAdminReportAnswerKeyMap,
  fetchAdminReportCorrectOptionsMap,
  fetchAdminSessionForReport,
  fetchPageAnswerRows,
  fetchPageQuestions,
  fetchSessionAnswerRows,
} from './admin-report-helpers'

// ---- Chain mock helpers -------------------------------------------------------

// Every builder method a call in this module might invoke. Each captured call
// records the exact args passed, per invocation of that method on the SAME chain
// (e.g. two `.order(...)` calls on one page fetch) — needed because the mocked
// chain otherwise returns whichever fixture was queued regardless of what the
// query actually asked for (code-style §7 non-vacuity requirement).
type CapturedCall = {
  select: unknown[][]
  eq: unknown[][]
  is: unknown[][]
  in: unknown[][]
  order: unknown[][]
  range: unknown[][]
}
const CAPTURED_METHODS = ['select', 'eq', 'is', 'in', 'order', 'range'] as const

function emptyCapture(): CapturedCall {
  return { select: [], eq: [], is: [], in: [], order: [], range: [] }
}

function buildChain(returnValue: unknown, captured: CapturedCall) {
  const awaitable = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  const proxy = new Proxy(awaitable as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'then') return target.then
      if (typeof prop === 'string' && (CAPTURED_METHODS as readonly string[]).includes(prop)) {
        return (...args: unknown[]) => {
          captured[prop as keyof CapturedCall].push(args)
          return proxy
        }
      }
      return (..._args: unknown[]) => proxy
    },
  })
  return proxy
}

/**
 * Queues one buildChain() response per adminClient.from() call, in order, and
 * returns the captured method-args per call — so a test can assert on the exact
 * columns/filters/order a specific `.from()` call issued, not just the fixture
 * it was handed back. Also captures the table name passed to each `.from()`
 * call: without this, a regression that repoints a query at the wrong table
 * (e.g. `student_responses` instead of `quiz_session_answers`) passes every
 * column/filter assertion below unchanged.
 */
function mockFromSequence(...responses: unknown[]): {
  capturedByCall: CapturedCall[]
  tablesByCall: string[]
} {
  let call = 0
  const capturedByCall: CapturedCall[] = []
  const tablesByCall: string[] = []
  mockAdminFrom.mockImplementation((table: string) => {
    const idx = call++
    const captured = emptyCapture()
    capturedByCall[idx] = captured
    tablesByCall[idx] = table
    return buildChain(responses[idx] ?? { data: null }, captured)
  })
  return { capturedByCall, tablesByCall }
}

// A minimal auth-client stand-in exposing only `.rpc`, matching what
// fetchAdminReportCorrectOptionsMap/fetchAdminReportAnswerKeyMap consume.
function fakeAuthClient(mockRpc: ReturnType<typeof vi.fn>) {
  return { rpc: mockRpc } as unknown as Parameters<typeof fetchAdminReportCorrectOptionsMap>[0]
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// fetchAdminSessionForReport
// ---------------------------------------------------------------------------

describe('fetchAdminSessionForReport', () => {
  it('scopes the query to the session id, the org id, and non-deleted rows', async () => {
    const { capturedByCall, tablesByCall } = mockFromSequence({
      data: { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' },
      error: null,
    })
    await fetchAdminSessionForReport({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      select: 'id, ended_at',
      logPrefix: '[test]',
    })
    expect(tablesByCall[0]).toBe('quiz_sessions')
    const captured = capturedByCall[0]
    expect(captured?.select[0]).toEqual(['id, ended_at'])
    expect(captured?.eq).toContainEqual(['id', 'sess-1'])
    expect(captured?.eq).toContainEqual(['organization_id', 'org-1'])
    expect(captured?.is[0]).toEqual(['deleted_at', null])
  })

  it('returns the fetched row on success', async () => {
    const row = { id: 'sess-1', ended_at: '2026-03-12T10:15:00Z' }
    mockFromSequence({ data: row, error: null })
    const result = await fetchAdminSessionForReport({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      select: 'id, ended_at',
      logPrefix: '[test]',
    })
    expect(result).toEqual({ data: row, error: null })
  })

  it('returns a null row without error when no matching session exists', async () => {
    mockFromSequence({ data: null, error: null })
    const result = await fetchAdminSessionForReport({
      sessionId: 'nonexistent',
      organizationId: 'org-1',
      select: 'id, ended_at',
      logPrefix: '[test]',
    })
    expect(result).toEqual({ data: null, error: null })
  })

  it('logs with the caller-provided prefix and surfaces the error on a query failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFromSequence({ data: null, error: { message: 'connection lost' } })
    const result = await fetchAdminSessionForReport({
      sessionId: 'sess-1',
      organizationId: 'org-1',
      select: 'id, ended_at',
      logPrefix: '[myCaller]',
    })
    expect(result).toEqual({ data: null, error: { message: 'connection lost' } })
    expect(errorSpy).toHaveBeenCalledWith('[myCaller] Session query error:', 'connection lost')
  })
})

// ---------------------------------------------------------------------------
// fetchSessionAnswerRows
// ---------------------------------------------------------------------------

describe('fetchSessionAnswerRows', () => {
  it('pages using the caller-supplied select columns and session filter', async () => {
    // Mirrors the summary caller's shape: select='question_id', orderColumns=['id'].
    const { capturedByCall, tablesByCall } = mockFromSequence(
      { count: 2, error: null }, // count query
      { data: [{ question_id: 'q1' }, { question_id: 'q2' }], error: null }, // page query
    )
    await fetchSessionAnswerRows({
      sessionId: 'sess-1',
      select: 'question_id',
      orderColumns: ['id'],
    })
    expect(tablesByCall).toEqual(['quiz_session_answers', 'quiz_session_answers'])
    const pageCapture = capturedByCall[1]
    // Narrow the indexed access (noUncheckedIndexedAccess): a missing page call is a
    // real failure — fetchSessionAnswerRows must issue count THEN page.
    if (!pageCapture) throw new Error('expected a page query call at index 1')
    expect(pageCapture.select[0]).toEqual(['question_id'])
    expect(pageCapture.eq[0]).toEqual(['session_id', 'sess-1'])
    expect(pageCapture.order).toEqual([['id', { ascending: true }]])
    expect(pageCapture.range[0]).toEqual([0, 1])
  })

  it('applies a DIFFERENT select and a multi-column order for a different call site', async () => {
    // Mirrors the questions caller's shape: select='question_id, answered_at',
    // orderColumns=['answered_at', 'id'] — proves the options are parameters,
    // not hardcoded to the shape used by the sibling call site above.
    const { capturedByCall, tablesByCall } = mockFromSequence(
      { count: 1, error: null },
      { data: [{ question_id: 'q1' }], error: null },
    )
    await fetchSessionAnswerRows({
      sessionId: 'sess-9',
      select: 'question_id, answered_at',
      orderColumns: ['answered_at', 'id'],
    })
    expect(tablesByCall).toEqual(['quiz_session_answers', 'quiz_session_answers'])
    const pageCapture = capturedByCall[1]
    // Narrow the indexed access (noUncheckedIndexedAccess): a missing page call is a
    // real failure — fetchSessionAnswerRows must issue count THEN page.
    if (!pageCapture) throw new Error('expected a page query call at index 1')
    expect(pageCapture.select[0]).toEqual(['question_id, answered_at'])
    expect(pageCapture.eq[0]).toEqual(['session_id', 'sess-9'])
    expect(pageCapture.order).toEqual([
      ['answered_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  it('returns the accumulated rows on success', async () => {
    const rows = [{ question_id: 'q1' }, { question_id: 'q2' }]
    mockFromSequence({ count: 2, error: null }, { data: rows, error: null })
    const result = await fetchSessionAnswerRows({
      sessionId: 'sess-1',
      select: 'question_id',
      orderColumns: ['id'],
    })
    expect(result).toEqual({ data: rows, error: null })
  })

  it('surfaces an error and no rows when the count query fails', async () => {
    mockFromSequence({ count: null, error: { message: 'count failed' } })
    const result = await fetchSessionAnswerRows({
      sessionId: 'sess-1',
      select: 'question_id',
      orderColumns: ['id'],
    })
    expect(result).toEqual({ data: [], error: { message: 'count failed' } })
  })

  it('surfaces an error when the count reports rows but a page resolves null', async () => {
    // The count already reported 2 rows, so this page lies within [0, total). A null
    // payload is therefore a count/page disagreement, not an empty page — and without a
    // guard fetchAllRows' `if (data) all.push(...data)` would skip it and return a short
    // list that reads as complete.
    mockFromSequence({ count: 2, error: null }, { data: null, error: null })
    const result = await fetchSessionAnswerRows({
      sessionId: 'sess-1',
      select: 'question_id',
      orderColumns: ['id'],
    })
    expect(result).toEqual({
      data: [],
      error: { message: 'quiz_session_answers: expected an array, got null' },
    })
  })

  it('discards a partial page and surfaces the error when the page fetch fails', async () => {
    mockFromSequence(
      { count: 2, error: null },
      { data: null, error: { message: 'page fetch failed' } },
    )
    const result = await fetchSessionAnswerRows({
      sessionId: 'sess-1',
      select: 'question_id',
      orderColumns: ['id'],
    })
    expect(result).toEqual({ data: [], error: { message: 'page fetch failed' } })
  })
})

// ---------------------------------------------------------------------------
// fetchPageAnswerRows
// ---------------------------------------------------------------------------

describe('fetchPageAnswerRows', () => {
  it('filters to the session and the page question ids, ordered by first-answered', async () => {
    const { capturedByCall, tablesByCall } = mockFromSequence({ data: [], error: null })
    await fetchPageAnswerRows('sess-1', ['q1', 'q2'])
    expect(tablesByCall[0]).toBe('quiz_session_answers')
    const captured = capturedByCall[0]
    const selectArg = captured?.select[0]?.[0]
    expect(typeof selectArg).toBe('string')
    expect(selectArg as string).toContain('question_id')
    expect(selectArg as string).toContain('response_text')
    expect(selectArg as string).toContain('blank_index')
    expect(captured?.eq[0]).toEqual(['session_id', 'sess-1'])
    expect(captured?.in[0]).toEqual(['question_id', ['q1', 'q2']])
    expect(captured?.order[0]).toEqual(['answered_at', { ascending: true }])
    expect(captured?.order[1]).toEqual(['id'])
  })

  it('returns the matching answer rows on success', async () => {
    const rows = [
      { question_id: 'q1', selected_option_id: 'opt-a', is_correct: true, response_time_ms: 2000 },
    ]
    mockFromSequence({ data: rows, error: null })
    const result = await fetchPageAnswerRows('sess-1', ['q1'])
    expect(result).toEqual({ data: rows, error: null })
  })

  it('returns no rows and surfaces the error on a query failure', async () => {
    mockFromSequence({ data: null, error: { message: 'answers query failed' } })
    const result = await fetchPageAnswerRows('sess-1', ['q1'])
    expect(result).toEqual({ data: [], error: { message: 'answers query failed' } })
  })

  it('returns an empty list rather than throwing when the query yields a non-array result', async () => {
    mockFromSequence({ data: null, error: null })
    const result = await fetchPageAnswerRows('sess-1', ['q1'])
    expect(result).toEqual({ data: [], error: null })
  })
})

// ---------------------------------------------------------------------------
// fetchPageQuestions
// ---------------------------------------------------------------------------

describe('fetchPageQuestions', () => {
  it('filters to the page question ids and requests the question_type column', async () => {
    const { capturedByCall, tablesByCall } = mockFromSequence({ data: [], error: null })
    await fetchPageQuestions(['q1', 'q2'])
    expect(tablesByCall[0]).toBe('questions')
    const captured = capturedByCall[0]
    const selectArg = captured?.select[0]?.[0]
    expect(typeof selectArg).toBe('string')
    expect(selectArg as string).toContain('question_type')
    expect(captured?.in[0]).toEqual(['id', ['q1', 'q2']])
  })

  it('returns the matching question rows on success', async () => {
    const rows = [{ id: 'q1', question_text: 'What is lift?', question_number: '050-01-001' }]
    mockFromSequence({ data: rows, error: null })
    const result = await fetchPageQuestions(['q1'])
    expect(result).toEqual({ data: rows, error: null })
  })

  it('returns no rows and surfaces the error on a query failure', async () => {
    mockFromSequence({ data: null, error: { message: 'questions query failed' } })
    const result = await fetchPageQuestions(['q1'])
    expect(result).toEqual({ data: [], error: { message: 'questions query failed' } })
  })

  it('returns an empty list rather than throwing when the query yields a non-array result', async () => {
    mockFromSequence({ data: null, error: null })
    const result = await fetchPageQuestions(['q1'])
    expect(result).toEqual({ data: [], error: null })
  })
})

// ---------------------------------------------------------------------------
// fetchAdminReportCorrectOptionsMap
// ---------------------------------------------------------------------------

describe('fetchAdminReportCorrectOptionsMap', () => {
  it('calls the RPC with the session id and keys the result by question id', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        { question_id: 'q1', correct_option_id: 'opt-a' },
        { question_id: 'q2', correct_option_id: 'opt-d' },
      ],
      error: null,
    })
    const result = await fetchAdminReportCorrectOptionsMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(mockRpc).toHaveBeenCalledWith('get_admin_report_correct_options', {
      p_session_id: 'sess-1',
    })
    expect(result.error).toBeNull()
    expect(result.data.get('q1')).toBe('opt-a')
    expect(result.data.get('q2')).toBe('opt-d')
  })

  it('returns an empty map and the error when the RPC fails', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const result = await fetchAdminReportCorrectOptionsMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(result.error).toEqual({ message: 'rpc failed' })
    expect(result.data.size).toBe(0)
  })

  it('surfaces an error naming the RPC when it yields a non-array result', async () => {
    // Coercing this to an empty map would report success while showing no correct answers.
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const result = await fetchAdminReportCorrectOptionsMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(result).toEqual({
      data: new Map(),
      error: { message: 'get_admin_report_correct_options: expected an array, got null' },
    })
  })
})

// ---------------------------------------------------------------------------
// fetchAdminReportAnswerKeyMap
// ---------------------------------------------------------------------------

describe('fetchAdminReportAnswerKeyMap', () => {
  it('calls the RPC with the session id and builds an entry keyed by question id', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        {
          question_id: 'q5',
          question_type: 'short_answer',
          blank_index: null,
          answer_key: 'mayday',
        },
      ],
      error: null,
    })
    const result = await fetchAdminReportAnswerKeyMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(mockRpc).toHaveBeenCalledWith('get_admin_report_answer_keys', {
      p_session_id: 'sess-1',
    })
    expect(result.error).toBeNull()
    expect(result.data.get('q5')).toEqual({ type: 'short_answer', canonical: 'mayday' })
  })

  it('returns an empty map and the error when the RPC fails', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'keys rpc failed' } })
    const result = await fetchAdminReportAnswerKeyMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(result.error).toEqual({ message: 'keys rpc failed' })
    expect(result.data.size).toBe(0)
  })

  it('returns an empty map when the RPC returns zero rows for an all-MC session', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const result = await fetchAdminReportAnswerKeyMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(result).toEqual({ data: new Map(), error: null })
  })

  it('surfaces an error naming the RPC when it yields a non-array result', async () => {
    // Coercing this to an empty map would report success while showing no answer keys.
    const mockRpc = vi.fn().mockResolvedValue({ data: {}, error: null })
    const result = await fetchAdminReportAnswerKeyMap(fakeAuthClient(mockRpc), 'sess-1')
    expect(result).toEqual({
      data: new Map(),
      error: { message: 'get_admin_report_answer_keys: expected an array, got object' },
    })
  })

  it('discards an at-cap first RPC result and surfaces the error from the paged re-fetch', async () => {
    // The first (unpaged) call returns exactly 1000 rows — indistinguishable from a
    // truncated result — so fetchAllRpcRows discards it and falls back to counting +
    // paging. The page fetch itself then fails; that failure must reach the caller.
    const staleFirstCall = Array.from({ length: 1000 }, (_, i) => ({
      question_id: `stale-${i}`,
      question_type: 'short_answer',
      blank_index: null,
      answer_key: 'x',
    }))
    const client = createChainableRpcClient({
      firstCall: { data: staleFirstCall, error: null },
      count: { count: 1200, error: null },
      pages: [{ data: null, error: { message: 'answer keys page fetch failed' } }],
    })
    const result = await fetchAdminReportAnswerKeyMap(
      client as unknown as Parameters<typeof fetchAdminReportAnswerKeyMap>[0],
      'sess-1',
    )
    expect(result).toEqual({
      data: new Map(),
      error: { message: 'answer keys page fetch failed' },
    })
  })
})
