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

import { startExamSession } from './start-exam'

// ---- Fixtures -------------------------------------------------------------

const VALID_SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

const RPC_SUCCESS = {
  data: {
    session_id: 'sess-exam-001',
    question_ids: ['q1', 'q2', 'q3'],
    time_limit_seconds: 3600,
    total_questions: 3,
    pass_mark: 75,
  },
  error: null,
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Auth -----------------------------------------------------------------

describe('startExamSession — authentication', () => {
  it('returns failure when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })
})

// ---- Input validation -----------------------------------------------------

describe('startExamSession — input validation', () => {
  it('returns failure when subjectId is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startExamSession({})
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure when subjectId is not a valid UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startExamSession({ subjectId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('returns failure for completely invalid input', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const result = await startExamSession(null)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })
})

// ---- RPC error handling ---------------------------------------------------

describe('startExamSession — RPC error messages', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns a domain-specific error when a Practice Exam is already in progress', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'already in progress for subject' } })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('A Practice Exam is already in progress for this subject.')
  })

  it('returns a domain-specific error when no exam configuration exists', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'no exam configuration found' } })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Practice Exam is not configured for this subject.')
  })

  it('returns a domain-specific error when there are not enough active questions', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'not enough active questions available' },
    })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not enough questions available to start this Practice Exam.')
  })

  it('returns a generic failure for an unknown RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'unexpected db failure' } })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start Practice Exam.')
  })

  it('returns a generic failure when RPC returns null data without an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to start Practice Exam.')
  })
})

// ---- Happy path -----------------------------------------------------------

describe('startExamSession — happy path', () => {
  it('returns exam session data on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue(RPC_SUCCESS)

    const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.sessionId).toBe('sess-exam-001')
    expect(result.questionIds).toEqual(['q1', 'q2', 'q3'])
    expect(result.timeLimitSeconds).toBe(3600)
    expect(result.passMark).toBe(75)
  })

  it('passes p_subject_id to the start_exam_session RPC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue(RPC_SUCCESS)

    await startExamSession({ subjectId: VALID_SUBJECT_ID })

    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'start_exam_session', {
      p_subject_id: VALID_SUBJECT_ID,
    })
  })
})

// ---- Uncaught errors ------------------------------------------------------

describe('startExamSession — uncaught errors', () => {
  it('returns a generic error and logs when an unexpected exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await startExamSession({ subjectId: VALID_SUBJECT_ID })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[startExamSession] Uncaught error:',
        expect.any(Error),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
