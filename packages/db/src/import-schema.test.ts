import { describe, expect, it } from 'vitest'
import { ImportFileSchema, ImportQuestionSchema } from './import-schema'

const validOptions = [
  { id: 'a', text: 'Option A' },
  { id: 'b', text: 'Option B' },
  { id: 'c', text: 'Option C' },
  { id: 'd', text: 'Option D' },
] as const

const validQuestion = {
  question_number: 'MET-001',
  subject: 'sub-001',
  subject_name: 'Meteorology',
  topic: null,
  topic_name: null,
  subtopic: null,
  subtopic_name: null,
  lo_reference: null,
  question_text: 'What is QNH?',
  question_image_url: null,
  options: [...validOptions],
  correct_option_id: 'a' as const,
  explanation_text: 'QNH is the altimeter subscale setting.',
  explanation_image_url: null,
  difficulty: null,
}

describe('ImportQuestionSchema', () => {
  it('accepts a valid question with all required fields', () => {
    expect(ImportQuestionSchema.safeParse(validQuestion).success).toBe(true)
  })

  it('accepts all valid correct_option_id values', () => {
    for (const id of ['a', 'b', 'c', 'd'] as const) {
      expect(
        ImportQuestionSchema.safeParse({ ...validQuestion, correct_option_id: id }).success,
      ).toBe(true)
    }
  })

  it('accepts a question with a non-null difficulty', () => {
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, difficulty: 'medium' }).success).toBe(
      true,
    )
  })

  it('rejects when correct_option_id is not a valid option letter', () => {
    expect(
      ImportQuestionSchema.safeParse({ ...validQuestion, correct_option_id: 'e' }).success,
    ).toBe(false)
  })

  it('rejects when correct_option_id does not match any option id in the options array', () => {
    // All four options use id 'a'; correct_option_id 'b' matches none.
    const options = validOptions.map((o) => ({ ...o, id: 'a' as const }))
    expect(
      ImportQuestionSchema.safeParse({ ...validQuestion, options, correct_option_id: 'b' }).success,
    ).toBe(false)
  })

  it('rejects when options contain duplicate ids', () => {
    const options = [
      { id: 'a', text: 'Option A' },
      { id: 'a', text: 'Option B' },
      { id: 'a', text: 'Option C' },
      { id: 'a', text: 'Option D' },
    ]
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, options }).success).toBe(false)
  })

  it('rejects when only three of the four option ids are distinct', () => {
    const options = [
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
      { id: 'c', text: 'Option C' },
      { id: 'c', text: 'Option C dup' },
    ]
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, options }).success).toBe(false)
  })

  it('rejects when options array has fewer than 4 entries', () => {
    const options = validOptions.slice(0, 3)
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, options }).success).toBe(false)
  })

  it('rejects when question_text is empty', () => {
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, question_text: '' }).success).toBe(
      false,
    )
  })

  it('rejects when explanation_text is empty', () => {
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, explanation_text: '' }).success).toBe(
      false,
    )
  })

  it('rejects when question_text is whitespace-only', () => {
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, question_text: '   ' }).success).toBe(
      false,
    )
  })

  it('rejects when explanation_text is whitespace-only', () => {
    expect(
      ImportQuestionSchema.safeParse({ ...validQuestion, explanation_text: '  \t ' }).success,
    ).toBe(false)
  })

  it('rejects when an option text is whitespace-only', () => {
    const options = [
      { id: 'a', text: '   ' },
      { id: 'b', text: 'Option B' },
      { id: 'c', text: 'Option C' },
      { id: 'd', text: 'Option D' },
    ]
    expect(ImportQuestionSchema.safeParse({ ...validQuestion, options }).success).toBe(false)
  })

  it('rejects when question_text exceeds the 10000-character cap', () => {
    expect(
      ImportQuestionSchema.safeParse({ ...validQuestion, question_text: 'x'.repeat(10001) })
        .success,
    ).toBe(false)
  })

  it('rejects an unrecognised difficulty value', () => {
    expect(
      ImportQuestionSchema.safeParse({ ...validQuestion, difficulty: 'very_hard' }).success,
    ).toBe(false)
  })
})

describe('ImportFileSchema', () => {
  it('accepts an array with one valid question', () => {
    expect(ImportFileSchema.safeParse([validQuestion]).success).toBe(true)
  })

  it('rejects an empty array', () => {
    expect(ImportFileSchema.safeParse([]).success).toBe(false)
  })

  it('rejects when any question in the array fails validation', () => {
    const badQuestion = { ...validQuestion, correct_option_id: 'z' }
    expect(ImportFileSchema.safeParse([validQuestion, badQuestion]).success).toBe(false)
  })
})
