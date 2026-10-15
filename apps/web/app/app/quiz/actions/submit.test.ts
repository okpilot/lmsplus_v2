import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockVerifySessionUser, mockRpc } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockRpc: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
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
  it('returns not-authenticated when the session has no verified user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await submitQuizAnswer(validInput)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  const validInput = {
    sessionId: '00000000-0000-4000-a000-000000000001',
    questionId: '00000000-0000-4000-a000-000000000002',
    selectedOptionId: 'a',
    responseTimeMs: 3000,
  }

  it('returns failure when user is not authenticated', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('surfaces an answer submission failure', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Answer not valid' } })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to submit answer')
  })

  it('treats empty answer data as a failure', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await submitQuizAnswer(validInput)
    expect(result.success).toBe(false)
  })

  it('returns correctness and explanation after a valid answer', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
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
    mockVerifySessionUser.mockResolvedValue(null)
    const result = await submitQuizAnswer({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Not authenticated')
  })

  it('returns failure for a malformed answer submission', async () => {
    mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
    const result = await submitQuizAnswer({})
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe('Invalid input')
  })
})
