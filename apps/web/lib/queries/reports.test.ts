import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc, mockFetchAnsweredItemCounts } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockFetchAnsweredItemCounts: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}))

// getSessionReports' own item-level fraction fix delegates to fetchAnsweredItemCounts —
// mocked at the module boundary here so these tests exercise ONLY the RPC-mapping/pagination
// orchestration in reports.ts. fetchAnsweredItemCounts' own paging/counting behavior (the
// answered-item-counts.ts) already has its own coverage in answered-item-counts.test.ts.
vi.mock('./answered-item-counts', () => ({
  fetchAnsweredItemCounts: (...args: unknown[]) => mockFetchAnsweredItemCounts(...args),
}))

import { getSessionReports } from './reports'

const DEFAULT_OPTS = { page: 1, sort: 'date' as const, dir: 'desc' as const }

function makeRpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    mode: 'quick_quiz',
    total_questions: 10,
    correct_count: 8,
    score_percentage: 80,
    started_at: '2026-03-12T10:00:00Z',
    ended_at: '2026-03-12T10:15:00Z',
    subject_id: 's-1',
    subject_name: 'Navigation',
    total_count: 1,
    ...overrides,
  }
}

describe('getSessionReports', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFetchAnsweredItemCounts.mockResolvedValue({ data: new Map(), error: null })
  })

  it('returns ok: false when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Not authenticated' })
  })

  it('returns ok: false when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Authentication failed' })
  })

  it('returns empty sessions array when RPC returns no rows', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
  })

  it('maps RPC rows with subject names and duration', async () => {
    mockRpc.mockResolvedValue({ data: [makeRpcRow()], error: null })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toHaveLength(1)
    const s = result.sessions[0]!
    expect(s.subjectName).toBe('Navigation')
    expect(s.durationMinutes).toBe(15)
    expect(s.scorePercentage).toBe(80)
    expect(s.totalQuestions).toBe(10)
    expect(s.correctCount).toBe(8)
    expect(result.totalCount).toBe(1)
  })

  it('returns ok: false when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  // ---- answeredItems (item-vs-question scale, #990 third surface) --------

  it('derives answeredItems from the answer-item count, not total_questions', async () => {
    // total_questions is 10 (from makeRpcRow); seed a distinct answered-item count so a
    // regression that fell back to total_questions would change the observed value.
    mockRpc.mockResolvedValue({
      data: [makeRpcRow({ id: 'sess-1', total_questions: 10 })],
      error: null,
    })
    mockFetchAnsweredItemCounts.mockResolvedValue({
      data: new Map([['sess-1', 3]]),
      error: null,
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions[0]!.answeredItems).toBe(3)
    expect(result.sessions[0]!.answeredItems).not.toBe(result.sessions[0]!.totalQuestions)
    // Pin the SECOND argument to the RLS-scoped client, not just "some object": `/app/reports`
    // is a student path, and passing the service-role client here would bypass the
    // `students_read_answers` policy that scopes this read. Only the mocked
    // createServerSupabaseClient result carries these two members.
    expect(mockFetchAnsweredItemCounts).toHaveBeenCalledWith(
      ['sess-1'],
      expect.objectContaining({
        rpc: mockRpc,
        auth: expect.objectContaining({ getUser: mockGetUser }),
      }),
    )
  })

  it('defaults answeredItems to 0 when the session has no recorded answer rows', async () => {
    // fetchAnsweredItemCounts leaves a session with zero answer rows absent from the Map —
    // exercises the `itemCounts.get(r.id) ?? 0` fallback at this call site.
    mockRpc.mockResolvedValue({ data: [makeRpcRow({ id: 'sess-1' })], error: null })
    mockFetchAnsweredItemCounts.mockResolvedValue({ data: new Map(), error: null })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions[0]!.answeredItems).toBe(0)
  })

  it('returns ok: false when the answered-item count lookup fails', async () => {
    mockRpc.mockResolvedValue({ data: [makeRpcRow()], error: null })
    mockFetchAnsweredItemCounts.mockResolvedValue({
      data: new Map(),
      error: { message: 'item count boom' },
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  it('sets subjectName to null when subject_name is null', async () => {
    mockRpc.mockResolvedValue({
      data: [makeRpcRow({ subject_id: null, subject_name: null })],
      error: null,
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions[0]!.subjectName).toBeNull()
  })

  it('passes correct RPC parameters for page 2', async () => {
    // Return a row so the paged fetch is non-empty and the out-of-range probe never fires —
    // this test verifies parameter routing for the first (paged) call only.
    mockRpc.mockResolvedValue({ data: [makeRpcRow()], error: null })

    await getSessionReports({ page: 2, sort: 'date', dir: 'desc' })

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'get_session_reports', {
      p_sort: 'started_at',
      p_dir: 'desc',
      p_limit: 10,
      p_offset: 10,
    })
  })

  it('passes correct RPC parameters for score ascending', async () => {
    mockRpc.mockResolvedValue({ data: [makeRpcRow()], error: null })

    await getSessionReports({ page: 1, sort: 'score', dir: 'asc' })

    expect(mockRpc).toHaveBeenCalledWith('get_session_reports', {
      p_sort: 'score_percentage',
      p_dir: 'asc',
      p_limit: 10,
      p_offset: 0,
    })
  })

  it('passes correct RPC parameters for subject sorting', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    await getSessionReports({ page: 1, sort: 'subject', dir: 'asc' })

    expect(mockRpc).toHaveBeenCalledWith('get_session_reports', {
      p_sort: 'subject_name',
      p_dir: 'asc',
      p_limit: 10,
      p_offset: 0,
    })
  })

  it('returns totalCount from window function in first row', async () => {
    mockRpc.mockResolvedValue({
      data: [makeRpcRow({ total_count: 42 })],
      error: null,
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalCount).toBe(42)
  })

  it('coerces BIGINT total_count from string to number', async () => {
    // PostgREST serializes BIGINT columns as strings. Without Number() coercion,
    // result.totalCount would be "1" and the caller's `=== 1` singular check would break.
    // (answered_count was the other BIGINT here; removed in #471 — no longer in the RPC output.)
    mockRpc.mockResolvedValue({
      data: [makeRpcRow({ total_count: '1' })],
      error: null,
    })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.totalCount).toBe(1)
  })

  it('coerces a fractional NUMERIC score_percentage from string to number', async () => {
    // NUMERIC columns also arrive as strings over the PostgREST wire (e.g. '73.33').
    mockRpc.mockResolvedValue({
      data: [makeRpcRow({ score_percentage: '73.33' })],
      error: null,
    })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions[0]!.scorePercentage).toBe(73.33)
  })

  it('keeps a null score_percentage as null', async () => {
    mockRpc.mockResolvedValue({
      data: [makeRpcRow({ score_percentage: null })],
      error: null,
    })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions[0]!.scorePercentage).toBeNull()
  })

  it('returns a numeric totalCount when an out-of-range page reports its total as a string', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ total_count: '42' }], error: null })
    const result = await getSessionReports({ page: 99, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 42 })
  })

  it('recovers the true total when an out-of-range page returns no rows', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ total_count: 42 }], error: null })
    const result = await getSessionReports({ page: 99, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 42 })
  })

  it('returns totalCount 0 when an out-of-range page belongs to a user with no sessions', async () => {
    // Out-of-range page AND the offset-0 recovery fetch also returns empty — the user
    // truly has no sessions, so the total resolves to 0.
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null }) // paged fetch — no rows
      .mockResolvedValueOnce({ data: [], error: null }) // probe — also no rows
    const result = await getSessionReports({ page: 99, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
  })

  it('returns an error when the total recovery fails on an out-of-range page', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const result = await getSessionReports({ page: 99, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  it('fails the list when the reports RPC returns a non-array payload', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  it('fails the list when the out-of-range total probe returns a non-array payload', async () => {
    // First call: an empty page on page 99 routes into the probe. The probe's own call then
    // returns null — a shape violation that must not read as a legitimate totalCount of 0.
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    const result = await getSessionReports({ page: 99, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  // ---- internal_exam exclusion --------------------------------------------

  it('filters out internal_exam rows from the session list', async () => {
    mockRpc.mockResolvedValue({
      data: [
        makeRpcRow({ id: 'sess-quick', mode: 'quick_quiz' }),
        makeRpcRow({ id: 'sess-internal', mode: 'internal_exam' }),
        makeRpcRow({ id: 'sess-mock', mode: 'mock_exam' }),
        makeRpcRow({ id: 'sess-smart', mode: 'smart_review' }),
      ],
      error: null,
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.sessions.map((s) => s.id)
    expect(ids).not.toContain('sess-internal')
    expect(ids).toEqual(['sess-quick', 'sess-mock', 'sess-smart'])
    // totalCount comes from the RPC window function (total_count field on the
    // first surviving row); makeRpcRow seeds it as 1.
    expect(result.totalCount).toBe(1)
  })

  it('excludes internal_exam session ids from the answered-item count lookup', async () => {
    // fetchAnsweredItemCounts must be called with the internal_exam-FILTERED id list, not the
    // raw RPC rows — a regression that passed the unfiltered list would ask for an item count
    // on a session this list never displays.
    mockRpc.mockResolvedValue({
      data: [
        makeRpcRow({ id: 'sess-quick', mode: 'quick_quiz' }),
        makeRpcRow({ id: 'sess-internal', mode: 'internal_exam' }),
      ],
      error: null,
    })

    await getSessionReports(DEFAULT_OPTS)

    expect(mockFetchAnsweredItemCounts).toHaveBeenCalledWith(['sess-quick'], expect.anything())
  })

  it('issues a single RPC call when a non-empty page filters down to no visible rows', async () => {
    // Belt-and-suspenders: if the RPC ever returns only internal_exam rows on page>1 (it
    // excludes them server-side today), allRows is non-empty so this is a FILTERED page, not an
    // out-of-range one — no second recovery fetch is needed, and the empty list reports total 0.
    mockRpc.mockResolvedValue({
      data: [
        makeRpcRow({ id: 'sess-i1', mode: 'internal_exam' }),
        makeRpcRow({ id: 'sess-i2', mode: 'internal_exam' }),
      ],
      error: null,
    })
    const result = await getSessionReports({ page: 2, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
    // only the single paged fetch was issued — no second RPC call
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('retains mock_exam, quick_quiz, and smart_review rows when filtering', async () => {
    mockRpc.mockResolvedValue({
      data: [
        makeRpcRow({ id: 'sess-mock', mode: 'mock_exam' }),
        makeRpcRow({ id: 'sess-quick', mode: 'quick_quiz' }),
        makeRpcRow({ id: 'sess-smart', mode: 'smart_review' }),
      ],
      error: null,
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toHaveLength(3)
    expect(result.sessions.map((s) => s.mode).sort()).toEqual(
      ['mock_exam', 'quick_quiz', 'smart_review'].sort(),
    )
  })

  it('returns empty sessions when every row is internal_exam', async () => {
    mockRpc.mockResolvedValue({
      data: [
        makeRpcRow({ id: 'a', mode: 'internal_exam' }),
        makeRpcRow({ id: 'b', mode: 'internal_exam' }),
      ],
      error: null,
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
  })
})
