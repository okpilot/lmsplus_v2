import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

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

import { getSessionReports } from './reports'

const DEFAULT_OPTS = { page: 1, sort: 'date' as const, dir: 'desc' as const }

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

  it('returns empty sessions array when no sessions', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: [], count: 0, error: null }))
    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 0 })
  })

  it('maps sessions with subject names and duration', async () => {
    const sessions = [
      {
        id: 'sess-1',
        mode: 'quick_quiz',
        total_questions: 10,
        correct_count: 8,
        score_percentage: 80,
        started_at: '2026-03-12T10:00:00Z',
        ended_at: '2026-03-12T10:15:00Z',
        subject_id: 's-1',
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: sessions, count: 1, error: null })
      if (table === 'easa_subjects')
        return buildChain({ data: [{ id: 's-1', name: 'Navigation' }], error: null })
      if (table === 'quiz_session_answers')
        return buildChain({ data: [{ session_id: 'sess-1' }], error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]!.subjectName).toBe('Navigation')
    expect(result.sessions[0]!.durationMinutes).toBe(15)
    expect(result.sessions[0]!.scorePercentage).toBe(80)
    expect(result.sessions[0]!.answeredCount).toBe(1)
    expect(result.totalCount).toBe(1)
  })

  it('returns ok: false when the quiz_sessions query returns an error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: null, count: null, error: { message: 'sessions DB error' } })
      return buildChain({ data: [], count: 0, error: null })
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  it('returns ok: false when the easa_subjects query returns an error', async () => {
    const sessions = [
      {
        id: 'sess-1',
        mode: 'quick_quiz',
        total_questions: 5,
        correct_count: 4,
        score_percentage: 80,
        started_at: '2026-03-12T10:00:00Z',
        ended_at: '2026-03-12T10:10:00Z',
        subject_id: 's-1',
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: sessions, count: 1, error: null })
      if (table === 'easa_subjects')
        return buildChain({ data: null, error: { message: 'subjects DB error' } })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  it('sets subjectName to null when session has no subject_id', async () => {
    const sessions = [
      {
        id: 'sess-2',
        mode: 'smart_review',
        total_questions: 3,
        correct_count: 2,
        score_percentage: 67,
        started_at: '2026-03-12T09:00:00Z',
        ended_at: '2026-03-12T09:05:00Z',
        subject_id: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: sessions, count: 1, error: null })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      // easa_subjects should not be queried when no subject IDs present
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]!.subjectName).toBeNull()
  })

  it('returns ok: false when the quiz_session_answers query returns an error', async () => {
    const sessions = [
      {
        id: 'sess-1',
        mode: 'quick_quiz',
        total_questions: 5,
        correct_count: 4,
        score_percentage: 80,
        started_at: '2026-03-12T10:00:00Z',
        ended_at: '2026-03-12T10:10:00Z',
        subject_id: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: sessions, count: 1, error: null })
      if (table === 'easa_subjects') return buildChain({ data: [], error: null })
      if (table === 'quiz_session_answers')
        return buildChain({ data: null, error: { message: 'answers DB error' } })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result).toMatchObject({ ok: false, error: 'Failed to load reports' })
  })

  it('falls back to total_questions for answeredCount when session has no answer rows', async () => {
    const sessions = [
      {
        id: 'sess-3',
        mode: 'quick_quiz',
        total_questions: 10,
        correct_count: 7,
        score_percentage: 70,
        started_at: '2026-03-12T11:00:00Z',
        ended_at: '2026-03-12T11:20:00Z',
        subject_id: null,
      },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: sessions, count: 1, error: null })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getSessionReports(DEFAULT_OPTS)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toHaveLength(1)
    // No answer rows → falls back to total_questions for legacy completed sessions
    expect(result.sessions[0]!.answeredCount).toBe(10)
  })

  it('calculates correct range for page 2', async () => {
    // page=2, PAGE_SIZE=10 → range(10, 19)
    mockFrom.mockImplementation(() => buildChain({ data: [], count: 15, error: null }))
    const result = await getSessionReports({ page: 2, sort: 'date', dir: 'desc' })
    expect(result).toMatchObject({ ok: true, sessions: [], totalCount: 15 })
  })

  it('respects sort direction — score ascending', async () => {
    const sessions = [
      {
        id: 'sess-1',
        mode: 'quick_quiz',
        total_questions: 5,
        correct_count: 4,
        score_percentage: 80,
        started_at: '2026-03-12T10:00:00Z',
        ended_at: '2026-03-12T10:10:00Z',
        subject_id: null,
      },
    ]
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions') return buildChain({ data: sessions, count: 1, error: null })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getSessionReports({ page: 1, sort: 'score', dir: 'asc' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sessions).toHaveLength(1)
  })
})
