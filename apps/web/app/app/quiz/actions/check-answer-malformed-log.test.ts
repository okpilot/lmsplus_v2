import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifySessionUser, mockRpc, mockClient } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  return { mockVerifySessionUser: vi.fn(), mockRpc, mockClient: { from: vi.fn(), rpc: mockRpc } }
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))
vi.mock('@/lib/auth/verify-session-user', () => ({ verifySessionUser: mockVerifySessionUser }))

import { checkAnswer } from './check-answer'

const QUESTION_ID = '00000000-0000-4000-a000-000000000011'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'

beforeEach(() => {
  vi.resetAllMocks()
  mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
})

describe('checkAnswer malformed RPC result', () => {
  it('logs "malformed RPC result" instead of undefined when the RPC returns the wrong shape without an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: { unexpected: true }, error: null })
    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: 'b',
      sessionId: SESSION_ID,
    })
    expect(result).toEqual({ success: false, error: 'Could not check answer' })
    expect(consoleSpy).toHaveBeenCalledWith('[checkAnswer] RPC error:', 'malformed RPC result', {
      questionId: QUESTION_ID,
      sessionId: SESSION_ID,
    })
  })
})
