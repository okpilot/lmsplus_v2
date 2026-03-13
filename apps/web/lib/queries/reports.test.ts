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

import { getAllSessions } from './reports'

describe('getAllSessions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getAllSessions()).rejects.toThrow('Not authenticated')
  })

  it('throws when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    await expect(getAllSessions()).rejects.toThrow('Auth error: session expired')
  })

  it('returns empty array when no sessions', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: [] }))
    const result = await getAllSessions()
    expect(result).toEqual([])
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
      if (table === 'quiz_sessions') return buildChain({ data: sessions })
      if (table === 'easa_subjects')
        return buildChain({ data: [{ id: 's-1', name: 'Navigation' }] })
      if (table === 'quiz_session_answers') return buildChain({ data: [{ session_id: 'sess-1' }] })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getAllSessions()
    expect(result).toHaveLength(1)
    expect(result[0]!.subjectName).toBe('Navigation')
    expect(result[0]!.durationMinutes).toBe(15)
    expect(result[0]!.scorePercentage).toBe(80)
    expect(result[0]!.answeredCount).toBe(1)
  })

  it('throws when the quiz_sessions query returns an error', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'quiz_sessions')
        return buildChain({ data: null, error: { message: 'sessions DB error' } })
      return buildChain({ data: [] })
    })

    await expect(getAllSessions()).rejects.toThrow('Failed to fetch sessions: sessions DB error')
  })

  it('throws when the easa_subjects query returns an error', async () => {
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
      if (table === 'quiz_sessions') return buildChain({ data: sessions, error: null })
      if (table === 'easa_subjects')
        return buildChain({ data: null, error: { message: 'subjects DB error' } })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getAllSessions()).rejects.toThrow('Failed to fetch subjects: subjects DB error')
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
      if (table === 'quiz_sessions') return buildChain({ data: sessions, error: null })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      // easa_subjects should not be queried when no subject IDs present
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getAllSessions()
    expect(result).toHaveLength(1)
    expect(result[0]!.subjectName).toBeNull()
  })

  it('throws when the quiz_session_answers query returns an error', async () => {
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
      if (table === 'quiz_sessions') return buildChain({ data: sessions, error: null })
      if (table === 'easa_subjects') return buildChain({ data: [], error: null })
      if (table === 'quiz_session_answers')
        return buildChain({ data: null, error: { message: 'answers DB error' } })
      throw new Error(`Unexpected table: ${table}`)
    })

    await expect(getAllSessions()).rejects.toThrow(
      'Failed to fetch answer counts: answers DB error',
    )
  })

  it('falls back to 0 for answeredCount when session has no answer rows', async () => {
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
      if (table === 'quiz_sessions') return buildChain({ data: sessions, error: null })
      if (table === 'quiz_session_answers') return buildChain({ data: [], error: null })
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getAllSessions()
    expect(result).toHaveLength(1)
    // No answer rows → falls back to 0 (unknown)
    expect(result[0]!.answeredCount).toBe(0)
  })
})
