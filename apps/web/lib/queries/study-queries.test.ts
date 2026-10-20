import { describe, expect, it } from 'vitest'

// ---- Subject under test ---------------------------------------------------

import { parseStudyQuestions } from './study-queries'

// ---- Helpers --------------------------------------------------------------

/** Minimal valid wire-shape row of the start_discovery `questions` payload. */
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

describe('parseStudyQuestions', () => {
  it('maps a valid study question into the client shape', () => {
    const result = parseStudyQuestions([makeRow()])
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

  it('drops a row whose id is not a string', () => {
    const result = parseStudyQuestions([makeRow({ id: 42 })])
    expect(result).toHaveLength(0)
  })

  it('drops a question whose answer key is missing or invalid', () => {
    const result = parseStudyQuestions([makeRow({ correct_option_id: null })])
    expect(result).toHaveLength(0)
  })

  it('returns an empty options list when the options field is not an array', () => {
    const result = parseStudyQuestions([makeRow({ options: 'not-an-array' })])
    expect(result).toHaveLength(1)
    expect(result[0]!.options).toEqual([])
  })

  it('silently drops individual option entries that lack string id or text', () => {
    const row = makeRow({
      options: [
        { id: 'a', text: 'Valid' },
        { id: 42, text: 'Bad id type' }, // non-string id
        { id: 'c' }, // missing text
        null, // null entry
      ],
    })
    const result = parseStudyQuestions([row])
    expect(result[0]!.options).toEqual([{ id: 'a', text: 'Valid' }])
  })

  it('strips extra fields from options, exposing only id and text per entry', () => {
    // Regression guard: if the RPC ever returns a `correct` field (or any extra key)
    // inside the options array, the mapper must not pass it through to the client.
    const row = makeRow({
      options: [
        { id: 'a', text: '1000 hPa', correct: false },
        { id: 'b', text: '1013 hPa', correct: true },
      ],
    })
    const result = parseStudyQuestions([row])
    expect(result[0]!.options).toEqual([
      { id: 'a', text: '1000 hPa' },
      { id: 'b', text: '1013 hPa' },
    ])
  })

  it('returns an empty array when the payload is null', () => {
    expect(parseStudyQuestions(null)).toEqual([])
  })

  it('returns an empty array when the payload is not an array', () => {
    expect(parseStudyQuestions({ id: 'q-1' })).toEqual([])
  })

  it('falls back to an empty prompt when the prompt is missing', () => {
    const result = parseStudyQuestions([makeRow({ question_text: null })])
    expect(result[0]!.questionText).toBe('')
  })

  it('falls back to an empty prompt when the prompt is not text', () => {
    // The new `typeof` guard (vs the old `?? ''`) must reject non-null non-string values
    // such as a number arriving from a malformed RPC row, not just null.
    const result = parseStudyQuestions([makeRow({ question_text: 42 })])
    expect(result[0]!.questionText).toBe('')
  })

  it('returns null for nullable string fields when the payload carries a non-string value', () => {
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
    const result = parseStudyQuestions([row])
    const q = result[0]!
    expect(q.subjectCode).toBeNull()
    expect(q.topicName).toBeNull()
    expect(q.subtopicName).toBeNull()
    expect(q.explanationText).toBeNull()
    expect(q.explanationImageUrl).toBeNull()
    expect(q.questionNumber).toBeNull()
    expect(q.difficulty).toBeNull()
  })

  it('returns a string image URL when the payload provides one for questionImageUrl', () => {
    // Positive path for the nullable image-URL field — validates the string branch of the
    // `typeof` guard passes valid URLs through unchanged.
    const row = makeRow({ question_image_url: 'https://cdn.example.com/img.png' })
    const result = parseStudyQuestions([row])
    expect(result[0]!.questionImageUrl).toBe('https://cdn.example.com/img.png')
  })

  it('keeps the payload order, which is the draw order', () => {
    const result = parseStudyQuestions([
      makeRow({ id: 'id-c' }),
      makeRow({ id: 'id-a' }),
      makeRow({ id: 'id-b' }),
    ])
    expect(result.map((q) => q.id)).toEqual(['id-c', 'id-a', 'id-b'])
  })
})
