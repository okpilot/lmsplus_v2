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

import { startVfrRtExam } from './start'

// ---- Fixtures -------------------------------------------------------------

const VALID_SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const VALID_SESSION_ID = '00000000-0000-4000-a000-000000000010'
const VALID_QUESTION_IDS = [
  '00000000-0000-4000-a000-000000000020',
  '00000000-0000-4000-a000-000000000021',
]

const RPC_SUCCESS = {
  session_id: VALID_SESSION_ID,
  question_ids: VALID_QUESTION_IDS,
  time_limit_seconds: 1800,
  parts: { p1_end: 1, p2_end: 2, p3_end: 2 },
  started_at: '2026-06-19T12:00:00.000Z',
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Authentication -------------------------------------------------------

describe('startVfrRtExam — authentication', () => {
  it('returns failure when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })
})

// ---- Input validation -----------------------------------------------------

describe('startVfrRtExam — input validation', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns failure when subjectId is missing', async () => {
    const result = await startVfrRtExam({})
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure when subjectId is not a valid UUID', async () => {
    const result = await startVfrRtExam({ subjectId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure when input is null', async () => {
    const result = await startVfrRtExam(null)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })
})

// ---- RPC error handling ---------------------------------------------------

describe('startVfrRtExam — RPC error messages', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns "Not authenticated" when the RPC returns not_authenticated', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authenticated' } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('tells the student the exam is not enabled when exam_config_required is returned', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'exam_config_required' } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('VFR RT mock exam is not enabled for your organization.')
  })

  it('tells the student the pool is incomplete when insufficient_questions_for_vfr_rt_exam is returned', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'insufficient_questions_for_vfr_rt_exam' },
    })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe(
      'The VFR RT question pool is incomplete. Please contact your instructor.',
    )
  })

  it('tells the student their account is inactive when user_not_found_or_inactive is returned', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found_or_inactive' } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Your account is inactive. Please contact your instructor.')
  })

  it('asks the student to reload on the active_session_exists concurrent-start race', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'active_session_exists' } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe(
      'A VFR RT exam session is already starting. Please reload and try again.',
    )
  })

  it('tells the user to finish their other session when a different one is already active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'another_session_active' } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe(
      'You already have an active session. Finish or discard it before starting a new one.',
    )
  })

  it('returns a generic failure for an unknown RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start exam')
  })

  it('logs server-side and never returns a raw DB error string', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'connection to db@1.2.3.4 refused' },
      })
      const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
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

describe('startVfrRtExam — RPC payload validation', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns failure when RPC returns null data without an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start exam')
  })

  it('returns failure when RPC payload is missing parts', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({
        data: { ...RPC_SUCCESS, parts: undefined },
        error: null,
      })
      const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to start exam')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[startVfrRtExam] Invalid RPC payload, fields:',
        expect.arrayContaining(['parts']),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ---- Happy path -----------------------------------------------------------

describe('startVfrRtExam — happy path', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns the session id and part boundaries on success', async () => {
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS, error: null })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe(VALID_SESSION_ID)
    expect(result.parts).toEqual({ p1End: 1, p2End: 2, p3End: 2 })
    expect(result.questionIds).toEqual(VALID_QUESTION_IDS)
    expect(result.timeLimitSeconds).toBe(1800)
  })

  it('returns session data when the RPC payload arrives as a single-row array', async () => {
    mockRpc.mockResolvedValue({ data: [RPC_SUCCESS], error: null })
    const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe(VALID_SESSION_ID)
  })

  it('passes the subject id as p_subject_id to start_vfr_rt_exam_session', async () => {
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS, error: null })
    await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'start_vfr_rt_exam_session', {
      p_subject_id: VALID_SUBJECT_ID,
    })
  })
})

// ---- Uncaught errors ------------------------------------------------------

describe('startVfrRtExam — uncaught errors', () => {
  it('returns a generic error and logs when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await startVfrRtExam({ subjectId: VALID_SUBJECT_ID })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith('[startVfrRtExam] Uncaught error:', expect.any(Error))
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
