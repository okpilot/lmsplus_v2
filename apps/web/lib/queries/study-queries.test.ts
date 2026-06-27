import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({}),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

// ---- Subject under test ---------------------------------------------------

import { getStudyQuestions } from './study-queries'

// ---- Helpers --------------------------------------------------------------

/** Minimal valid wire-shape row returned by the get_study_questions RPC. */
function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q-1',
    question_text: 'What is the standard sea-level pressure?',
    question_image_url: null,
    options: [
      { id: 'a', text: '1000 hPa' },
      { id: 'b', text: '1013 hPa' },
      { id: 'c', text: '1025 hPa' },
    ],
    correct_option_id: 'b',
    subject_code: 'MET',
    topic_name: 'Meteorology',
    subtopic_name: 'Atmosphere',
    explanation_text: 'Standard QNH is 1013.25 hPa.',
    explanation_image_url: null,
    question_number: '010-12345',
    difficulty: 'medium',
    ...overrides,
  }
}

// ---- Tests ----------------------------------------------------------------

describe('getStudyQuestions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns an empty array without calling the RPC when given an empty id list', async () => {
    const result = await getStudyQuestions([])
    expect(mockRpc).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('throws when the RPC reports an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(getStudyQuestions(['q-1'])).rejects.toThrow('Failed to fetch study questions')
  })

  it('returns questions with camelCase fields from a valid RPC row', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow()], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result).toHaveLength(1)
    const q = result[0]!
    expect(q.id).toBe('q-1')
    expect(q.questionText).toBe('What is the standard sea-level pressure?')
    expect(q.questionImageUrl).toBeNull()
    expect(q.correctOptionId).toBe('b')
    expect(q.subjectCode).toBe('MET')
    expect(q.topicName).toBe('Meteorology')
    expect(q.subtopicName).toBe('Atmosphere')
    expect(q.explanationText).toBe('Standard QNH is 1013.25 hPa.')
    expect(q.explanationImageUrl).toBeNull()
    expect(q.questionNumber).toBe('010-12345')
    expect(q.difficulty).toBe('medium')
    expect(q.options).toEqual([
      { id: 'a', text: '1000 hPa' },
      { id: 'b', text: '1013 hPa' },
      { id: 'c', text: '1025 hPa' },
    ])
  })

  it('drops a row whose id is not a string', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow({ id: 42 })], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result).toHaveLength(0)
  })

  it('drops a row whose correct_option_id is not a string', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow({ correct_option_id: null })], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result).toHaveLength(0)
  })

  it('returns an empty options list when the options field is not an array', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow({ options: 'not-an-array' })], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result).toHaveLength(1)
    expect(result[0]!.options).toEqual([])
  })

  it('silently drops individual option entries that lack string id or text', async () => {
    const row = makeRow({
      options: [
        { id: 'a', text: 'Valid' },
        { id: 42, text: 'Bad id type' }, // non-string id
        { id: 'c' }, // missing text
        null, // null entry
      ],
    })
    mockRpc.mockResolvedValue({ data: [row], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result[0]!.options).toEqual([{ id: 'a', text: 'Valid' }])
  })

  it('strips extra fields from options, exposing only id and text per entry', async () => {
    // Regression guard: if the RPC ever returns a `correct` field (or any extra key)
    // inside the options array, the mapper must not pass it through to the client.
    const row = makeRow({
      options: [
        { id: 'a', text: '1000 hPa', correct: false },
        { id: 'b', text: '1013 hPa', correct: true },
      ],
    })
    mockRpc.mockResolvedValue({ data: [row], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result[0]!.options).toEqual([
      { id: 'a', text: '1000 hPa' },
      { id: 'b', text: '1013 hPa' },
    ])
  })

  it('returns an empty array when the RPC returns null data with no error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result).toEqual([])
  })

  it('uses an empty string for questionText when question_text is null', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow({ question_text: null })], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result[0]!.questionText).toBe('')
  })

  it('calls the get_study_questions RPC with the provided question ids', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await getStudyQuestions(['id-1', 'id-2'])
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_study_questions', {
      p_question_ids: ['id-1', 'id-2'],
    })
  })
})
