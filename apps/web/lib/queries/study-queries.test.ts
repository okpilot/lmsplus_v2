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

  it('throws when loading study questions fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(getStudyQuestions(['q-1'])).rejects.toThrow('Failed to fetch study questions')
  })

  it('maps a valid study question into the client shape', async () => {
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

  it('drops a question whose answer key is missing or invalid', async () => {
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

  it('falls back to an empty prompt when the prompt is missing', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow({ question_text: null })], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result[0]!.questionText).toBe('')
  })

  it('falls back to an empty prompt when the prompt is not text', async () => {
    // The new `typeof` guard (vs the old `?? ''`) must reject non-null non-string values
    // such as a number arriving from a malformed RPC row, not just null.
    mockRpc.mockResolvedValue({ data: [makeRow({ question_text: 42 })], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result[0]!.questionText).toBe('')
  })

  it('returns null for nullable string fields when the RPC returns a non-string value', async () => {
    // All seven nullable fields use the same `typeof v === 'string' ? v : null` guard.
    // A non-null, non-string value (e.g. a number from a shape regression) must coerce to null.
    const row = makeRow({
      subject_code: 99,
      topic_name: true,
      subtopic_name: [],
      explanation_text: {},
      explanation_image_url: 0,
      question_number: false,
      difficulty: null,
    })
    mockRpc.mockResolvedValue({ data: [row], error: null })
    const result = await getStudyQuestions(['q-1'])
    const q = result[0]!
    expect(q.subjectCode).toBeNull()
    expect(q.topicName).toBeNull()
    expect(q.subtopicName).toBeNull()
    expect(q.explanationText).toBeNull()
    expect(q.explanationImageUrl).toBeNull()
    expect(q.questionNumber).toBeNull()
    expect(q.difficulty).toBeNull()
  })

  it('returns a string image URL when the RPC provides one for questionImageUrl', async () => {
    // Positive path for the nullable image-URL field — validates the string branch of the
    // `typeof` guard passes valid URLs through unchanged.
    const row = makeRow({ question_image_url: 'https://cdn.example.com/img.png' })
    mockRpc.mockResolvedValue({ data: [row], error: null })
    const result = await getStudyQuestions(['q-1'])
    expect(result[0]!.questionImageUrl).toBe('https://cdn.example.com/img.png')
  })

  it('calls the get_study_questions RPC with the provided question ids', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await getStudyQuestions(['id-1', 'id-2'])
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_study_questions', {
      p_question_ids: ['id-1', 'id-2'],
    })
  })

  it('returns questions in the order the caller requested, regardless of RPC row order', async () => {
    // The DB returns `WHERE id = ANY(...)` rows in arbitrary order. The deck must follow
    // the caller's (randomly-sampled) selection order, so feed rows shuffled relative to
    // the input and assert the result is re-sorted back to the requested order.
    mockRpc.mockResolvedValue({
      data: [makeRow({ id: 'id-c' }), makeRow({ id: 'id-a' }), makeRow({ id: 'id-b' })],
      error: null,
    })
    const result = await getStudyQuestions(['id-a', 'id-b', 'id-c'])
    expect(result.map((q) => q.id)).toEqual(['id-a', 'id-b', 'id-c'])
  })
})
