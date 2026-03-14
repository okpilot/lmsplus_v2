import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

// ---- Subject under test ---------------------------------------------------

import { completeQuiz } from './complete'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('completeQuiz', () => {
  const validInput = { sessionId: '00000000-0000-0000-0000-000000000001' }

  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('surfaces a quiz completion failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Session not found' } })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to complete session')
  })

  it('treats empty completion data as a failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(false)
  })

  it('returns the score summary after completing a quiz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: [{ total_questions: 10, correct_count: 7, score_percentage: 70 }],
      error: null,
    })
    const result = await completeQuiz(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.totalQuestions).toBe(10)
    expect(result.correctCount).toBe(7)
    expect(result.scorePercentage).toBe(70)
  })

  it('rejects unauthenticated calls before input validation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await completeQuiz({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns error for a completion request without a session ID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await completeQuiz({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })
})
