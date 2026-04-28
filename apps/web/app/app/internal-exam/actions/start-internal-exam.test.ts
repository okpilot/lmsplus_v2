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

import { startInternalExam } from './start-internal-exam'

// ---- Fixtures -------------------------------------------------------------

const VALID_CODE = 'ABC12345'
const VALID_SESSION_ID = '00000000-0000-4000-a000-000000000010'
const VALID_QUESTION_IDS = [
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000021',
]

const RPC_SUCCESS_ROW = {
  session_id: VALID_SESSION_ID,
  question_ids: VALID_QUESTION_IDS,
  time_limit_seconds: 3600,
  total_questions: 2,
  pass_mark: 75,
  started_at: '2026-04-29T12:00:00.000Z',
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Auth -----------------------------------------------------------------

describe('startInternalExam — authentication', () => {
  it('returns failure when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })
})

// ---- Input validation -----------------------------------------------------

describe('startInternalExam — input validation', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns failure when code is missing', async () => {
    const result = await startInternalExam({})
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure when code is empty', async () => {
    const result = await startInternalExam({ code: '' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure when input is null', async () => {
    const result = await startInternalExam(null)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })
})

// ---- RPC error handling ---------------------------------------------------

describe('startInternalExam — RPC error messages', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('maps code_not_found to a unified generic message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'code_not_found' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid or expired code. Please contact your administrator.')
  })

  it('maps code_not_yours to the same unified message as code_not_found', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'code_not_yours' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    // Must NOT reveal that the code exists for a different student.
    expect(result.error).toBe('Invalid or expired code. Please contact your administrator.')
  })

  it('maps code_expired to a domain-specific message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'code_expired' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('This code has expired. Please contact your administrator.')
  })

  it('maps code_already_used to a domain-specific message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'code_already_used' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('This code has already been used.')
  })

  it('maps code_voided to a domain-specific message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'code_voided' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('This code has been cancelled. Please contact your administrator.')
  })

  it('maps active_session_exists to a domain-specific message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'active_session_exists' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe(
      'You already have an active internal exam session for this subject. Submit it before starting a new one.',
    )
  })

  it('maps insufficient_questions_for_exam to a domain-specific message', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'insufficient_questions_for_exam' },
    })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Cannot start exam: not enough questions configured.')
  })

  it('returns a generic failure for an unknown RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start internal exam.')
  })

  it('logs server-side and returns generic message; never returns raw DB error string', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'connection to db@1.2.3.4 refused' },
      })
      const result = await startInternalExam({ code: VALID_CODE })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).not.toContain('1.2.3.4')
      expect(consoleSpy).toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ---- RPC payload validation ----------------------------------------------

describe('startInternalExam — RPC payload validation', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns failure when RPC returns null data without an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start internal exam.')
  })

  it('returns failure when RPC payload is missing session_id', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({
        data: [{ ...RPC_SUCCESS_ROW, session_id: undefined }],
        error: null,
      })
      const result = await startInternalExam({ code: VALID_CODE })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to start internal exam.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[startInternalExam] Invalid RPC payload, fields:',
        expect.arrayContaining(['session_id']),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('rejects pass_mark = 0', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...RPC_SUCCESS_ROW, pass_mark: 0 }],
      error: null,
    })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start internal exam.')
  })
})

// ---- Happy path -----------------------------------------------------------

describe('startInternalExam — happy path', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns sessionId on success when RPC returns a TABLE (array)', async () => {
    mockRpc.mockResolvedValue({ data: [RPC_SUCCESS_ROW], error: null })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe(VALID_SESSION_ID)
  })

  it('handles RPC returning a single object (not wrapped in array)', async () => {
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS_ROW, error: null })
    const result = await startInternalExam({ code: VALID_CODE })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe(VALID_SESSION_ID)
  })

  it('passes p_code to start_internal_exam_session RPC', async () => {
    mockRpc.mockResolvedValue({ data: [RPC_SUCCESS_ROW], error: null })
    await startInternalExam({ code: VALID_CODE })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'start_internal_exam_session', {
      p_code: VALID_CODE,
    })
  })
})

// ---- Uncaught errors ------------------------------------------------------

describe('startInternalExam — uncaught errors', () => {
  it('returns a generic error and logs when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await startInternalExam({ code: VALID_CODE })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[startInternalExam] Uncaught error:',
        expect.any(Error),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
