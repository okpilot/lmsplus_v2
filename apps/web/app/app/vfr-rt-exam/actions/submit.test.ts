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

import { submitVfrRtExam } from './submit'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const MC_Q = '00000000-0000-4000-a000-000000000011'
const SHORT_Q = '00000000-0000-4000-a000-000000000022'
const DIALOG_Q = '00000000-0000-4000-a000-000000000033'

const MC_ENTRY = { questionId: MC_Q, selectedOptionId: 'b', responseTimeMs: 2000 }
const SHORT_ENTRY = { questionId: SHORT_Q, responseText: 'climb to 3000ft', responseTimeMs: 3000 }
const DIALOG_ENTRY = {
  questionId: DIALOG_Q,
  blankIndex: 0,
  responseText: 'wilco',
  responseTimeMs: 1500,
}

const RPC_SUCCESS = {
  session_id: SESSION_ID,
  part1_pct: 80,
  part2_pct: 60,
  part3_pct: 90,
  passed_overall: true,
  correct_count: 23,
  total_questions: 30,
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Authentication -------------------------------------------------------

describe('submitVfrRtExam — authentication', () => {
  it('returns failure when the user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('returns failure when authentication returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'token refresh failed' },
    })
    const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })
})

// ---- Input validation -----------------------------------------------------

describe('submitVfrRtExam — input validation', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('rejects an empty answers array', async () => {
    const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('rejects a non-UUID sessionId', async () => {
    const result = await submitVfrRtExam({ sessionId: 'not-a-uuid', answers: [MC_ENTRY] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an MC entry that also carries a response text', async () => {
    const result = await submitVfrRtExam({
      sessionId: SESSION_ID,
      answers: [{ questionId: MC_Q, selectedOptionId: 'a', responseText: 'oops' }],
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('rejects an MC entry with an option outside a-d', async () => {
    const result = await submitVfrRtExam({
      sessionId: SESSION_ID,
      answers: [{ questionId: MC_Q, selectedOptionId: 'e' }],
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })

  it('rejects a dialog entry missing the blank index', async () => {
    const result = await submitVfrRtExam({
      sessionId: SESSION_ID,
      answers: [{ questionId: DIALOG_Q, responseText: 'wilco', extraKey: 1 }],
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Invalid input')
  })
})

// ---- Answer mapping (camelCase -> snake_case) ----------------------------

describe('submitVfrRtExam — answer mapping', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS, error: null })
  })

  it('maps a multiple-choice entry to selected_option_id with response_time_ms', async () => {
    await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
    const callArgs = mockRpc.mock.calls[0]?.[2] as { p_answers: Record<string, unknown>[] }
    expect(callArgs.p_answers[0]).toEqual({
      question_id: MC_Q,
      selected_option_id: 'b',
      response_time_ms: 2000,
    })
  })

  it('maps a short-answer entry to response_text', async () => {
    await submitVfrRtExam({ sessionId: SESSION_ID, answers: [SHORT_ENTRY] })
    const callArgs = mockRpc.mock.calls[0]?.[2] as { p_answers: Record<string, unknown>[] }
    expect(callArgs.p_answers[0]).toEqual({
      question_id: SHORT_Q,
      response_text: 'climb to 3000ft',
      response_time_ms: 3000,
    })
  })

  it('maps a dialog entry to blank_index and response_text', async () => {
    await submitVfrRtExam({ sessionId: SESSION_ID, answers: [DIALOG_ENTRY] })
    const callArgs = mockRpc.mock.calls[0]?.[2] as { p_answers: Record<string, unknown>[] }
    expect(callArgs.p_answers[0]).toEqual({
      question_id: DIALOG_Q,
      blank_index: 0,
      response_text: 'wilco',
      response_time_ms: 1500,
    })
  })

  it('defaults a missing response time to zero', async () => {
    await submitVfrRtExam({
      sessionId: SESSION_ID,
      answers: [{ questionId: MC_Q, selectedOptionId: 'a' }],
    })
    const callArgs = mockRpc.mock.calls[0]?.[2] as { p_answers: Record<string, unknown>[] }
    expect(callArgs.p_answers[0]).toMatchObject({ response_time_ms: 0 })
  })

  it('passes the session id as p_session_id to the submit_vfr_rt_exam_answers RPC', async () => {
    await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY, SHORT_ENTRY, DIALOG_ENTRY] })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'submit_vfr_rt_exam_answers',
      expect.objectContaining({ p_session_id: SESSION_ID }),
    )
  })
})

// ---- Happy path -----------------------------------------------------------

describe('submitVfrRtExam — happy path', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns the results redirect target on success', async () => {
    mockRpc.mockResolvedValue({ data: RPC_SUCCESS, error: null })
    const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.session_id).toBe(SESSION_ID)
    expect(result.redirect_to).toBe(`/app/vfr-rt-exam/results/${SESSION_ID}`)
  })
})

// ---- RPC error handling ---------------------------------------------------

describe('submitVfrRtExam — RPC error handling', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  it('returns a generic failure and logs when the RPC errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'answer_type_mismatch' } })
      const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to submit exam')
      expect(consoleSpy).toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('never returns a raw DB error string to the client', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'connection to db@10.0.0.5 refused' },
      })
      const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).not.toContain('10.0.0.5')
    } finally {
      consoleSpy.mockRestore()
    }
  })
})

// ---- Uncaught errors ------------------------------------------------------

describe('submitVfrRtExam — uncaught errors', () => {
  it('returns a generic error and logs when an unexpected exception is thrown', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockRejectedValue(new Error('connection reset'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const result = await submitVfrRtExam({ sessionId: SESSION_ID, answers: [MC_ENTRY] })
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Something went wrong. Please try again.')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[submitVfrRtExam] Uncaught error:',
        expect.any(Error),
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
