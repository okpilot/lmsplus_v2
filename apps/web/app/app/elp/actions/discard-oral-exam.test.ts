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
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { discardOralExam } from './discard-oral-exam'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const USER_ID = '00000000-0000-4000-a000-000000000002'

const VALID_INPUT = { sessionId: SESSION_ID }

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

function setupAuth({
  user = { id: USER_ID },
  error = null,
}: {
  user?: { id: string } | null
  error?: { message: string } | null
} = {}) {
  mockGetUser.mockResolvedValue({ data: { user }, error })
}

// ---- Tests ----------------------------------------------------------------

describe('discardOralExam', () => {
  it('returns failure when the user is not authenticated', async () => {
    setupAuth({ user: null })
    const result = await discardOralExam(VALID_INPUT)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
    const result = await discardOralExam(VALID_INPUT)
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
  })

  it('returns failure when the input is missing the session id', async () => {
    setupAuth()
    const result = await discardOralExam({})
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns failure when the session id is not a valid UUID', async () => {
    setupAuth()
    const result = await discardOralExam({ sessionId: 'not-a-uuid' })
    expect(result).toEqual({ success: false, error: 'Invalid input' })
  })

  it('returns a not-found error when the session does not exist', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'oral_session_not_found' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await discardOralExam(VALID_INPUT)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Oral exam session not found.' })
  })

  it('returns an account-inactive message when the student account is soft-deleted', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found_or_inactive' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await discardOralExam(VALID_INPUT)
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Your account is inactive. Please contact your administrator.',
    })
  })

  it('returns a generic error for an unrecognised RPC failure', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected_error' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await discardOralExam(VALID_INPUT)
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Failed to discard oral exam. Please try again.',
    })
  })

  it('returns failure when the RPC returns null even without an error', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: null, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await discardOralExam(VALID_INPUT)
    consoleSpy.mockRestore()
    expect(result).toEqual({
      success: false,
      error: 'Failed to discard oral exam. Please try again.',
    })
  })

  it('returns success when the RPC returns true', async () => {
    setupAuth()
    mockRpc.mockResolvedValue({ data: true, error: null })
    const result = await discardOralExam(VALID_INPUT)
    expect(result).toEqual({ success: true })
  })

  it('returns success when the RPC returns false, because false is not null', async () => {
    // discard_oral_exam_session returns a boolean; false means the session was
    // already ended — the server decided, so the client treats it as success.
    // The action checks `data === null`, not `!data`, so false → success.
    setupAuth()
    mockRpc.mockResolvedValue({ data: false, error: null })
    const result = await discardOralExam(VALID_INPUT)
    expect(result).toEqual({ success: true })
  })

  it('returns a generic error when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await discardOralExam(VALID_INPUT)
    consoleSpy.mockRestore()
    expect(result).toEqual({ success: false, error: 'Something went wrong. Please try again.' })
  })
})
