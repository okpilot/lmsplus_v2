import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockClient, mockCreateClient } = vi.hoisted(() => {
  const mockClient = { marker: 'server-client' }
  return { mockRpc: vi.fn(), mockClient, mockCreateClient: vi.fn(async () => mockClient) }
})

vi.mock('@/lib/supabase-rpc', () => ({ rpc: mockRpc }))

const mockVerifySessionUser = vi.fn().mockResolvedValue({ id: 'user-1' })

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: (client: unknown) => mockVerifySessionUser(client),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: () => mockCreateClient(),
}))

import { loadVfrRtExamQuestions } from './load-vfr-rt-exam-questions'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'

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
  it('verifies identity on the same client it loads questions with', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockRpc.mock.calls[0]?.[0]).toBe(mockClient)
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
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_vfr_rt_exam_questions', {
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
