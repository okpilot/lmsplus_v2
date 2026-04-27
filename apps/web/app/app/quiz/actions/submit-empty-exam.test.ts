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

import { submitEmptyExamSession } from './submit-empty-exam'

// ---- Fixtures -------------------------------------------------------------

const VALID_SESSION_ID = '00000000-0000-4000-a000-000000000010'

const RPC_SUCCESS = {
  data: {
    session_id: VALID_SESSION_ID,
    score_percentage: 0,
    passed: false,
    total_questions: 5,
    answered_count: 0,
  },
  error: null,
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Auth -----------------------------------------------------------------

describe('submitEmptyExamSession — authentication', () => {
  it('returns failure when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })
})

// ---- Input validation -----------------------------------------------------

describe('submitEmptyExamSession — input validation', () => {
  it('returns failure when sessionId is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await submitEmptyExamSession({})
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure when sessionId is not a valid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await submitEmptyExamSession({ sessionId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure for completely invalid input', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await submitEmptyExamSession(null)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })
})

// ---- RPC error handling ---------------------------------------------------

describe('submitEmptyExamSession — RPC error messages', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns a domain-specific error when session is not a mock exam', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'session is not a mock exam' },
    })
    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Session is not a Practice Exam.')
  })

  it('returns a domain-specific error when session is not found', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'session not found or not accessible' },
    })
    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Session not found.')
  })

  it('returns a generic failure for an unknown RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to complete Practice Exam.')
  })

  it('returns a generic failure when RPC returns null data without an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to complete Practice Exam.')
  })

  it('does not leak raw RPC error message to the client', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'connection to server at "10.0.0.1" failed' },
      })
      const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
      expect(result.success).toBe(false)
      if (result.success) return
      // Must not expose internal connection details
      expect(result.error).not.toContain('10.0.0.1')
      expect(result.error).toBe('Failed to complete Practice Exam.')
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ---- Happy path -----------------------------------------------------------

describe('submitEmptyExamSession — happy path', () => {
  it('returns success with sessionId on a valid RPC response', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue(RPC_SUCCESS)

    const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe(VALID_SESSION_ID)
  })

  it('passes p_session_id to the complete_empty_exam_session RPC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue(RPC_SUCCESS)

    await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })

    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'complete_empty_exam_session', {
      p_session_id: VALID_SESSION_ID,
    })
  })
})

// ---- Uncaught errors ------------------------------------------------------

describe('submitEmptyExamSession — uncaught errors', () => {
  it('returns a generic error and logs when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await submitEmptyExamSession({ sessionId: VALID_SESSION_ID })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[submitEmptyExamSession] Uncaught error:',
        expect.any(Error),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
