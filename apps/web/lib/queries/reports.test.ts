import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
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
    answered_count: 10,
    total_count: 1,
    ...overrides,
  }
}

describe('getSessionReports', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
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
    expect(result.sessions[0]!.subjectName).toBe('Navigation')
    expect(result.sessions[0]!.durationMinutes).toBe(15)
    expect(result.sessions[0]!.scorePercentage).toBe(80)
    expect(result.sessions[0]!.answeredCount).toBe(10)
    expect(result.totalCount).toBe(1)
  })

  it('returns ok: false when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
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
    mockRpc.mockResolvedValue({ data: [], error: null })

    await getSessionReports({ page: 2, sort: 'date', dir: 'desc' })

    expect(mockRpc).toHaveBeenCalledWith('get_session_reports', {
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

  it('returns empty sessions with totalCount 0 when page exceeds results', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await getSessionReports({ page: 99, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
  })

  it('treats non-array RPC data as empty result', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
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
