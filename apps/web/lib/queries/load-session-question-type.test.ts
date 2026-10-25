import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRpc, mockClient } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  return { mockRpc, mockClient: { rpc: mockRpc } }
})

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (_client: unknown, fn: string, args: unknown) => mockRpc(fn, args),
}))
vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
}))
vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => mockClient,
}))

import { isQuestionType, QUESTION_TYPES } from './load-session-question-row'
import { loadSessionQuestions } from './load-session-questions'
import { loadVfrRtExamQuestions } from './load-vfr-rt-exam-questions'

const Q1 = '00000000-0000-4000-a000-000000000001'
const Q2 = '00000000-0000-4000-a000-000000000002'
const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const KNOWN_TYPES = ['multiple_choice', 'short_answer', 'dialog_fill', 'ordering', 'diagram_label']
const FAILURE = { success: false, error: 'Failed to load questions. Please try again.' }

const row = (id: string, question_type: string) => ({
  id,
  question_text: `Q ${id}`,
  question_image_url: null,
  question_number: null,
  options: null,
  question_type,
  dialog_template: null,
  blanks_safe: null,
  ordering_items_shuffled: null,
  diagram_config_public: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('isQuestionType', () => {
  it('accepts exactly the five known question types', () => {
    expect([...(QUESTION_TYPES ?? [])].sort()).toEqual(
      ['diagram_label', 'dialog_fill', 'multiple_choice', 'ordering', 'short_answer'].sort(),
    )
    for (const t of KNOWN_TYPES) expect(isQuestionType(t)).toBe(true)
  })

  it('rejects unknown and non-string values', () => {
    expect(isQuestionType('essay')).toBe(false)
    expect(isQuestionType('')).toBe(false)
    expect(isQuestionType(null)).toBe(false)
    expect(isQuestionType(3)).toBe(false)
  })
})

describe('loadSessionQuestions question_type fail-closed', () => {
  it('returns the load-failure result and logs when any row has an unknown question_type', async () => {
    mockRpc.mockResolvedValue({
      data: [row(Q1, 'multiple_choice'), row(Q2, 'essay')],
      error: null,
    })
    const result = await loadSessionQuestions([Q1, Q2])
    expect(result).toEqual(FAILURE)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown question_type'), Q2)
  })

  it.each(KNOWN_TYPES)('passes a %s row through unchanged', async (type) => {
    mockRpc.mockResolvedValue({ data: [row(Q1, type)], error: null })
    const result = await loadSessionQuestions([Q1])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]?.question_type).toBe(type)
  })
})

describe('loadVfrRtExamQuestions question_type fail-closed', () => {
  it('returns the load-failure result and logs when any row has an unknown question_type', async () => {
    mockRpc.mockResolvedValue({
      data: [row(Q1, 'short_answer'), row(Q2, 'essay')],
      error: null,
    })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result).toEqual(FAILURE)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown question_type'), Q2)
  })

  it.each(KNOWN_TYPES)('passes a %s row through unchanged', async (type) => {
    mockRpc.mockResolvedValue({ data: [row(Q1, type)], error: null })
    const result = await loadVfrRtExamQuestions({ sessionId: SESSION_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]?.question_type).toBe(type)
  })
})
