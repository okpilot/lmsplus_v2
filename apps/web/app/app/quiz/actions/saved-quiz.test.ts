import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifySessionUser, mockRpc, mockCount, mockEq } = vi.hoisted(() => ({
  mockVerifySessionUser: vi.fn(),
  mockRpc: vi.fn(),
  mockCount: vi.fn(),
  mockEq: vi.fn(),
}))

const mockClient = vi.hoisted(() => ({
  from: () => ({
    select: () => ({
      eq: (...a: unknown[]) => {
        mockEq(...a)
        return { not: (...n: unknown[]) => mockCount(...n) }
      },
    }),
  }),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import { SIGN_IN } from './progress-error-messages'
import {
  checkSavedQuizRoom,
  discardSavedQuiz,
  resumeSavedQuiz,
  saveQuizForLater,
} from './saved-quiz'

const SESSION = '00000000-0000-4000-a000-000000000099'
const DEVICE = '00000000-0000-4000-a000-0000000000d1'

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockVerifySessionUser.mockResolvedValue({ id: 'u1', email: null })
  mockRpc.mockResolvedValue({ data: null, error: null })
  mockCount.mockResolvedValue({ count: 0, error: null })
})

describe('saveQuizForLater', () => {
  it('verifies identity on the session client', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    await saveQuizForLater({ sessionId: SESSION, deviceId: DEVICE })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('saves the quiz for later on the caller device', async () => {
    expect(await saveQuizForLater({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: true,
    })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'save_quiz_for_later', {
      p_session_id: SESSION,
      p_device_id: DEVICE,
    })
  })

  it('tells the student when the saved-quiz cap is reached', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'saved_quiz_limit_reached' } })
    expect(await saveQuizForLater({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: expect.stringMatching(/20 saved quizzes/i),
    })
  })

  it('never returns the raw database message for an unknown error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation secret_table failed' } })
    const result = await saveQuizForLater({ sessionId: SESSION, deviceId: DEVICE })
    expect(result).toEqual({ success: false, error: expect.any(String) })
    expect(JSON.stringify(result)).not.toContain('secret_table')
  })

  it.each([
    ['a non-uuid session id', { sessionId: 'nope', deviceId: DEVICE }],
    ['a missing device id', { sessionId: SESSION }],
    ['an unexpected extra field', { sessionId: SESSION, deviceId: DEVICE, extra: 1 }],
  ])('rejects %s without calling the RPC', async (_label, input) => {
    expect(await saveQuizForLater(input)).toEqual({ success: false, error: 'Invalid input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller without calling the RPC', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    expect(await saveQuizForLater({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: SIGN_IN,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('resumeSavedQuiz', () => {
  it('verifies identity on the session client', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    await resumeSavedQuiz({ sessionId: SESSION, deviceId: DEVICE })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('restores the quiz through the RPC on the caller device', async () => {
    expect(await resumeSavedQuiz({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: true,
    })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'resume_saved_quiz', {
      p_session_id: SESSION,
      p_device_id: DEVICE,
    })
  })

  it('tells the student another session is open', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    expect(await resumeSavedQuiz({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: expect.stringMatching(/active session/i),
    })
  })

  it('tells the student a quiz that was not saved cannot be resumed', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_not_saved' } })
    expect(await resumeSavedQuiz({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: expect.stringMatching(/not (in your )?saved/i),
    })
  })

  it('rejects invalid input without calling the RPC', async () => {
    expect(await resumeSavedQuiz({ sessionId: SESSION, deviceId: 'x' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller without calling the RPC', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    expect(await resumeSavedQuiz({ sessionId: SESSION, deviceId: DEVICE })).toEqual({
      success: false,
      error: SIGN_IN,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('discardSavedQuiz', () => {
  it('verifies identity on the session client', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    await discardSavedQuiz({ sessionId: SESSION })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('discards the saved quiz through the RPC', async () => {
    expect(await discardSavedQuiz({ sessionId: SESSION })).toEqual({ success: true })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'discard_saved_quiz', {
      p_session_id: SESSION,
    })
  })

  it('tells the student the quiz could not be found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_not_found' } })
    expect(await discardSavedQuiz({ sessionId: SESSION })).toEqual({
      success: false,
      error: 'This session could not be found.',
    })
  })

  it('rejects invalid input without calling the RPC', async () => {
    expect(await discardSavedQuiz({ sessionId: 'nope' })).toEqual({
      success: false,
      error: 'Invalid input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller without calling the RPC', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    expect(await discardSavedQuiz({ sessionId: SESSION })).toEqual({
      success: false,
      error: SIGN_IN,
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('checkSavedQuizRoom', () => {
  it('verifies identity on the session client', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    await checkSavedQuizRoom()
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
  })

  it('allows a start while the student is under the saved-quiz cap', async () => {
    mockCount.mockResolvedValue({ count: 19, error: null })
    expect(await checkSavedQuizRoom()).toEqual({ success: true })
    expect(mockEq).toHaveBeenCalledWith('student_id', 'u1')
  })

  it('tells the student when the saved-quiz cap is already reached', async () => {
    mockCount.mockResolvedValue({ count: 20, error: null })
    expect(await checkSavedQuizRoom()).toEqual({
      success: false,
      error: expect.stringMatching(/20 saved quizzes/i),
    })
  })

  it('returns a generic message and logs when the count query fails', async () => {
    mockCount.mockResolvedValue({ count: null, error: { message: 'relation secret_table failed' } })
    const result = await checkSavedQuizRoom()
    expect(result).toEqual({ success: false, error: expect.any(String) })
    expect(JSON.stringify(result)).not.toContain('secret_table')
    expect(console.error).toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller without querying', async () => {
    mockVerifySessionUser.mockResolvedValue(null)
    expect(await checkSavedQuizRoom()).toEqual({ success: false, error: SIGN_IN })
    expect(mockCount).not.toHaveBeenCalled()
  })
})
