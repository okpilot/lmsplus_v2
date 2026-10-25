import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockClient, mockCreateClient } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  const mockClient = { marker: 'server-client', rpc: mockRpc }
  return { mockRpc, mockClient, mockCreateClient: vi.fn(async () => mockClient) }
})

const mockVerifySessionUser = vi.fn().mockResolvedValue({ id: 'user-1' })

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: (client: unknown) => mockVerifySessionUser(client),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: () => mockCreateClient(),
}))

import { loadVfrRtExamQuestions } from './load-vfr-rt-exam-questions'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const Q1 = '00000000-0000-4000-a000-000000000001'
const Q2 = '00000000-0000-4000-a000-000000000002'
const KNOWN_TYPES = ['multiple_choice', 'short_answer', 'dialog_fill', 'ordering', 'diagram_label']
const FAILURE = { success: false, error: 'Failed to load questions. Please try again.' }

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  question_text: `Q ${id}`,
  question_image_url: null,
  question_number: null,
  options: null,
  question_type: 'short_answer',
  dialog_template: null,
  blanks_safe: null,
  ordering_items_shuffled: null,
  diagram_config_public: null,
  ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  mockCreateClient.mockImplementation(async () => mockClient)
  mockVerifySessionUser.mockResolvedValue({ id: 'user-1' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loadVfrRtExamQuestions', () => {
  it('reports no questions found for the verified session user when the RPC returns none', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result).toEqual({ success: false, error: 'No questions found' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })

  it('rejects a non-uuid session id without touching the database', async () => {
    const result = await loadVfrRtExamQuestions({ sessionId: 'nope' })
    expect(result.success).toBe(false)
    expect(mockVerifySessionUser).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns Not authenticated when there is no user', async () => {
    mockVerifySessionUser.mockResolvedValueOnce(null)
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result).toEqual({ success: false, error: 'Not authenticated' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns a generic error and hides the RPC message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Session not found or not owned' } })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result).toEqual({
      success: false,
      error: 'Failed to load questions. Please try again.',
    })
  })

  it('returns No questions found when the RPC returns no rows', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result).toEqual({ success: false, error: 'No questions found' })
  })

  it('calls the exam RPC with the session id and keeps the RPC row order', async () => {
    mockRpc.mockResolvedValue({ data: [row('b'), row('a')], error: null })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(mockRpc).toHaveBeenCalledWith('get_vfr_rt_exam_questions', {
      p_session_id: SESSION_ID,
    })
    if (!result.success) throw new Error(result.error)
    expect(result.questions.map((q) => q.id)).toEqual(['b', 'a'])
  })

  it('maps ordering items and diagram config and nulls the explanations', async () => {
    const items = [
      { id: 'x', text: 'X' },
      { id: 'y', text: 'Y' },
    ]
    mockRpc.mockResolvedValue({
      data: [
        row('o', { question_type: 'ordering', ordering_items_shuffled: items }),
        row('d', {
          question_type: 'diagram_label',
          diagram_config_public: {
            image_ref: 'rwy',
            zones: [{ id: 'z1', x: 0, y: 0, w: 1, h: 1 }],
            labels: [{ id: 'l1', text: 'L' }],
          },
        }),
      ],
      error: null,
    })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    if (!result.success) throw new Error(result.error)
    const [ord, dia] = result.questions
    expect(ord?.ordering_items).toEqual(items)
    expect(dia?.diagram_config?.image_ref).toBe('rwy')
    expect(ord?.explanation_text).toBeNull()
    expect(ord?.explanation_image_url).toBeNull()
  })
})

describe('loadVfrRtExamQuestions question_type fail-closed', () => {
  it('returns the load-failure result and logs when any row has an unknown question_type', async () => {
    mockRpc.mockResolvedValue({
      data: [row(Q1, { question_type: 'short_answer' }), row(Q2, { question_type: 'essay' })],
      error: null,
    })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result).toEqual(FAILURE)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown question_type'), Q2)
  })

  it.each(KNOWN_TYPES)('passes a %s row through unchanged', async (type) => {
    mockRpc.mockResolvedValue({ data: [row(Q1, { question_type: type })], error: null })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]?.question_type).toBe(type)
  })
})
