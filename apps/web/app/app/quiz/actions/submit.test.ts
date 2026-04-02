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

import { submitQuizAnswer } from './submit'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

describe('submitQuizAnswer', () => {
  const validInput = {
    sessionId: '00000000-0000-4000-a000-000000000001',
    questionId: '00000000-0000-4000-a000-000000000002',
    selectedOptionId: 'a',
    responseTimeMs: 3000,
  }

  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('surfaces an answer submission failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Answer not valid' } })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to submit answer')
  })

  it('treats empty answer data as a failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
  })

  it('returns correctness and explanation after a valid answer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: [
        {
          is_correct: true,
          correct_option_id: 'a',
          explanation_text: 'Because reasons',
          explanation_image_url: null,
        },
      ],
      error: null,
    })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(true)
    expect(result.correctOptionId).toBe('a')
    expect(result.explanationText).toBe('Because reasons')
    expect(result.explanationImageUrl).toBeNull()
  })

  it('rejects unauthenticated calls before input validation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitQuizAnswer({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns failure for a malformed answer submission', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await submitQuizAnswer({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })
})
