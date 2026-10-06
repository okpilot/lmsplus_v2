import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import { finishQuizSession } from './finish'
import { SIGN_IN } from './progress-error-messages'

const SESSION = '00000000-0000-4000-a000-000000000099'
const DEVICE = '00000000-0000-4000-a000-0000000000d1'

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mockRpc.mockResolvedValue({ data: {}, error: null })
})

describe('finishQuizSession', () => {
  it('finishes the session through the RPC with snake_case arguments', async () => {
    expect(await finishQuizSession({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: true,
    })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'finish_quiz_session', {
      p_session_id: SESSION,
      p_device_id: DEVICE,
    })
  })

  it.each([
    ['a non-uuid session id', { sessionId: 'nope', deviceId: DEVICE }],
    ['a missing device id', { sessionId: SESSION }],
    ['an unexpected extra field', { sessionId: SESSION, deviceId: DEVICE, extra: 1 }],
  ])('rejects %s without calling the RPC', async (_label, input) => {
    expect(await finishQuizSession(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('asks the student to sign in again when there is no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await finishQuizSession({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: SIGN_IN,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('shows the mapped copy when another device holds the session', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_taken_over' } })
    expect(await finishQuizSession({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: expect.stringMatching(/another tab or device/i),
    })
  })

  it('never returns the raw database message for an unknown error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation secret_table failed' } })
    const result = await finishQuizSession({ sessionId: SESSION, deviceId: DEVICE })
    expect(result).toEqual({
      success: false,
      error: 'Could not finish the quiz. Please try again.',
    })
    expect(JSON.stringify(result)).not.toContain('secret_table')
  })
})
