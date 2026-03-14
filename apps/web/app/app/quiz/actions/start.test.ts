import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc, mockGetRandomQuestionIds } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockGetRandomQuestionIds: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

vi.mock('@/lib/queries/quiz', () => ({
  getRandomQuestionIds: mockGetRandomQuestionIds,
}))

// ---- Subject under test ---------------------------------------------------

import { startQuizSession } from './start'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('startQuizSession', () => {
  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when no questions are available', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue([])
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions available for this selection')
  })

  it('surfaces a session-start failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2'])
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 5,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start session')
  })

  it('returns success with sessionId and questionIds on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockResolvedValue(['q1', 'q2', 'q3'])
    mockRpc.mockResolvedValue({ data: 'session-123', error: null })
    const result = await startQuizSession({
      subjectId: '00000000-0000-0000-0000-000000000001',
      topicId: null,
      count: 3,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe('session-123')
    expect(result.questionIds).toEqual(['q1', 'q2', 'q3'])
  })

  it('rejects unauthenticated calls before input validation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns failure for an invalid quiz configuration', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Required')
  })

  it('returns failure for a non-UUID subject ID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startQuizSession({ subjectId: 'not-a-uuid', topicId: null, count: 5 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid uuid')
  })

  it('returns failure and logs when an unexpected error is thrown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetRandomQuestionIds.mockRejectedValue(new Error('unexpected DB failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await startQuizSession({
        subjectId: '00000000-0000-0000-0000-000000000001',
        topicId: null,
        count: 5,
      })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[startQuizSession] Uncaught error:',
        expect.any(Error),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
