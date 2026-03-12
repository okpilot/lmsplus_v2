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
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await getAllSessions()
    expect(result).toHaveLength(1)
    expect(result[0]!.subjectName).toBe('Navigation')
    expect(result[0]!.durationMinutes).toBe(15)
    expect(result[0]!.scorePercentage).toBe(80)
  })
})
