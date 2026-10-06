import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

import { recheckRestoredAnswers } from './recheck-answers'

const USER_ID = '00000000-0000-4000-a000-000000000001'
const SESSION_ID = '00000000-0000-4000-a000-000000000099'
const DEVICE_ID = '00000000-0000-4000-a000-0000000000d1'
const Q1 = '00000000-0000-4000-a000-000000000011'
const Q2 = '00000000-0000-4000-a000-000000000012'
const Q3 = '00000000-0000-4000-a000-000000000013'
const FOREIGN = '00000000-0000-4000-a000-0000000000ff'

const MC_RPC = {
  is_correct: false,
  correct_option_id: 'c',
  explanation_text: 'why',
  explanation_image_url: null,
}
const SHORT_RPC = {
  is_correct: true,
  correct_answer: 'qnh',
  blanks: null,
  explanation_text: null,
  explanation_image_url: null,
}

function sessionChain(result: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { config: { question_ids: [Q1, Q2, Q3] } },
      error: null,
      ...result,
    }),
  }
}

function input(answers: unknown[]) {
  return { sessionId: SESSION_ID, deviceId: DEVICE_ID, answers }
}

const mc = (questionId: string) => ({ questionId, selectedOptionId: 'a' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mockFrom.mockReturnValue(sessionChain())
  mockRpc.mockResolvedValue({ data: MC_RPC, error: null })
})

describe('recheckRestoredAnswers', () => {
  it('rejects a caller who is not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await recheckRestoredAnswers(input([mc(Q1)]))

    expect(result).toEqual({ success: false, error: expect.stringContaining('sign-in') })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty answer list', input([])],
    ['more answers than one batch', input(Array.from({ length: 26 }, () => mc(Q1)))],
    ['a missing device', { sessionId: SESSION_ID, answers: [mc(Q1)] }],
    ['an unknown extra field', { ...input([mc(Q1)]), timeSpentMs: 5 }],
  ])('rejects %s before touching the database', async (_label, raw) => {
    const result = await recheckRestoredAnswers(raw)

    expect(result).toEqual({ success: false, error: 'Invalid input' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('grades a multiple choice answer and returns its feedback keyed by question', async () => {
    const result = await recheckRestoredAnswers(input([mc(Q1)]))

    expect(result).toEqual({
      success: true,
      done: false,
      feedback: {
        [Q1]: {
          questionType: 'multiple_choice',
          isCorrect: false,
          correctOptionId: 'c',
          explanationText: 'why',
          explanationImageUrl: null,
        },
      },
    })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'check_quiz_answer',
      expect.objectContaining({
        p_question_id: Q1,
        p_selected_option_id: 'a',
        p_device_id: DEVICE_ID,
        p_time_spent_ms: null,
      }),
    )
  })

  it('grades a non multiple choice answer without a visit time', async () => {
    mockRpc.mockResolvedValue({ data: SHORT_RPC, error: null })

    const result = await recheckRestoredAnswers(input([{ questionId: Q2, responseText: 'QNH' }]))

    expect(result).toMatchObject({
      success: true,
      feedback: { [Q2]: { questionType: 'short_answer', isCorrect: true, correctAnswer: 'qnh' } },
    })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.anything(),
      'check_non_mc_answer',
      expect.objectContaining({ p_device_id: DEVICE_ID, p_time_spent_ms: null }),
    )
  })

  it('reads the session once, scoped to its owner and still active', async () => {
    const chain = sessionChain()
    mockFrom.mockReturnValue(chain)

    await recheckRestoredAnswers(input([mc(Q1), mc(Q2)]))

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('quiz_sessions')
    expect(chain.eq).toHaveBeenCalledWith('student_id', USER_ID)
    expect(chain.is).toHaveBeenCalledWith('ended_at', null)
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('drops an answer for a question outside the session', async () => {
    const result = await recheckRestoredAnswers(input([mc(FOREIGN), mc(Q1)]))

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ success: true })
    expect(Object.keys((result as { feedback: object }).feedback)).toEqual([Q1])
  })

  it('still grades the good answers when one answer is malformed', async () => {
    const result = await recheckRestoredAnswers(
      input([{ questionId: Q1, selectedOptionId: 'z' }, { questionId: Q2 }, mc(Q3)]),
    )

    expect(Object.keys((result as { feedback: object }).feedback)).toEqual([Q3])
  })

  it('skips an answer whose grading fails and carries on with the rest', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'question_not_found' } })
      .mockResolvedValueOnce({ data: MC_RPC, error: null })

    const result = await recheckRestoredAnswers(input([mc(Q1), mc(Q2)]))

    expect(Object.keys((result as { feedback: object }).feedback)).toEqual([Q2])
    expect(result).toMatchObject({ success: true, done: false })
  })

  it('fails with the takeover message and stops grading when another tab took the session', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_taken_over' } })

    const result = await recheckRestoredAnswers(input([mc(Q1), mc(Q2)]))

    expect(result).toEqual({ success: false, error: expect.stringContaining('another tab') })
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('stops grading and returns what it has when the session has ended', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: MC_RPC, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'session_ended' } })

    const result = await recheckRestoredAnswers(input([mc(Q1), mc(Q2), mc(Q3)]))

    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(Object.keys((result as { feedback: object }).feedback)).toEqual([Q1])
    expect(result).toMatchObject({ success: true, done: true })
  })

  it('stops grading a damaged session and reports the batch done', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_config_malformed' } })

    const result = await recheckRestoredAnswers(input([mc(Q1), mc(Q2)]))

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true, done: true, feedback: {} })
  })

  it('fails with the account message and stops grading when the account is no longer active', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'user not found or inactive' } })

    const result = await recheckRestoredAnswers(input([mc(Q1), mc(Q2)]))

    expect(result).toEqual({ success: false, error: expect.stringContaining('no longer active') })
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('returns no feedback for a session that is not the caller’s', async () => {
    mockFrom.mockReturnValue(
      sessionChain({ data: null, error: { code: 'PGRST116', message: 'x' } }),
    )

    const result = await recheckRestoredAnswers(input([mc(Q1)]))

    expect(result).toEqual({ success: true, done: true, feedback: {} })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('fails without leaking the database message when the session read errors', async () => {
    mockFrom.mockReturnValue(
      sessionChain({ data: null, error: { code: '57014', message: 'secret internal detail' } }),
    )

    const result = await recheckRestoredAnswers(input([mc(Q1)]))

    expect(result).toEqual({ success: false, error: 'Could not check answer' })
  })
})
