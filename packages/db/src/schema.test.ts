import { describe, expect, it } from 'vitest'
import {
  CompleteQuizSessionSchema,
  DeleteSyllabusItemSchema,
  StartQuizSessionSchema,
  SubmitAnswerSchema,
  UpsertSubjectSchema,
  UpsertSubtopicSchema,
  UpsertTopicSchema,
} from './schema'

// ---- Fixtures ----------------------------------------------------------------

const VALID_UUID = '00000000-0000-4000-a000-000000000001'
const INVALID_UUID = 'not-a-uuid'

// ---- SubmitAnswerSchema -------------------------------------------------------

describe('SubmitAnswerSchema', () => {
  it('accepts a valid submission', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: VALID_UUID,
      questionId: VALID_UUID,
      selectedOptionId: 'a',
      responseTimeMs: 1000,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID sessionId', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: INVALID_UUID,
      questionId: VALID_UUID,
      selectedOptionId: 'b',
      responseTimeMs: 500,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID questionId', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: VALID_UUID,
      questionId: INVALID_UUID,
      selectedOptionId: 'c',
      responseTimeMs: 500,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an option outside the enum', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: VALID_UUID,
      questionId: VALID_UUID,
      selectedOptionId: 'e',
      responseTimeMs: 500,
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero responseTimeMs', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: VALID_UUID,
      questionId: VALID_UUID,
      selectedOptionId: 'd',
      responseTimeMs: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative responseTimeMs', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: VALID_UUID,
      questionId: VALID_UUID,
      selectedOptionId: 'a',
      responseTimeMs: -100,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a fractional responseTimeMs', () => {
    const result = SubmitAnswerSchema.safeParse({
      sessionId: VALID_UUID,
      questionId: VALID_UUID,
      selectedOptionId: 'a',
      responseTimeMs: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

// ---- StartQuizSessionSchema --------------------------------------------------

describe('StartQuizSessionSchema', () => {
  it('accepts a valid session with all fields', () => {
    const result = StartQuizSessionSchema.safeParse({
      mode: 'quick_quiz',
      subjectId: VALID_UUID,
      topicId: VALID_UUID,
      questionIds: [VALID_UUID],
    })
    expect(result.success).toBe(true)
  })

  it('accepts null subjectId and null topicId', () => {
    const result = StartQuizSessionSchema.safeParse({
      mode: 'mock_exam',
      subjectId: null,
      topicId: null,
      questionIds: [VALID_UUID],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty questionIds array', () => {
    const result = StartQuizSessionSchema.safeParse({
      mode: 'quick_quiz',
      subjectId: null,
      topicId: null,
      questionIds: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID in questionIds', () => {
    const result = StartQuizSessionSchema.safeParse({
      mode: 'quick_quiz',
      subjectId: null,
      topicId: null,
      questionIds: [INVALID_UUID],
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unrecognised mode', () => {
    const result = StartQuizSessionSchema.safeParse({
      mode: 'unknown_mode',
      subjectId: null,
      topicId: null,
      questionIds: [VALID_UUID],
    })
    expect(result.success).toBe(false)
  })
})

// ---- CompleteQuizSessionSchema -----------------------------------------------

describe('CompleteQuizSessionSchema', () => {
  it('accepts a valid UUID sessionId', () => {
    const result = CompleteQuizSessionSchema.safeParse({ sessionId: VALID_UUID })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID sessionId', () => {
    const result = CompleteQuizSessionSchema.safeParse({ sessionId: INVALID_UUID })
    expect(result.success).toBe(false)
  })

  it('rejects a missing sessionId', () => {
    const result = CompleteQuizSessionSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---- UpsertSubjectSchema -----------------------------------------------------

describe('UpsertSubjectSchema', () => {
  it('accepts a valid subject without id (create path)', () => {
    const result = UpsertSubjectSchema.safeParse({
      code: 'MET',
      name: 'Meteorology',
      short: 'MET',
      sort_order: 1,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid subject with a UUID id (update path)', () => {
    const result = UpsertSubjectSchema.safeParse({
      id: VALID_UUID,
      code: 'MET',
      name: 'Meteorology',
      short: 'MET',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID id', () => {
    const result = UpsertSubjectSchema.safeParse({
      id: INVALID_UUID,
      code: 'MET',
      name: 'Meteorology',
      short: 'MET',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty code', () => {
    const result = UpsertSubjectSchema.safeParse({ code: '', name: 'Meteorology', short: 'MET' })
    expect(result.success).toBe(false)
  })

  it('rejects a code exceeding 10 characters', () => {
    const result = UpsertSubjectSchema.safeParse({
      code: 'TOOLONGCODE',
      name: 'Meteorology',
      short: 'MET',
    })
    expect(result.success).toBe(false)
  })
})

// ---- UpsertTopicSchema -------------------------------------------------------

describe('UpsertTopicSchema', () => {
  it('accepts a valid topic', () => {
    const result = UpsertTopicSchema.safeParse({
      subject_id: VALID_UUID,
      code: '050',
      name: 'Meteorology',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID subject_id', () => {
    const result = UpsertTopicSchema.safeParse({
      subject_id: INVALID_UUID,
      code: '050',
      name: 'Meteorology',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty topic name', () => {
    const result = UpsertTopicSchema.safeParse({
      subject_id: VALID_UUID,
      code: '050',
      name: '',
    })
    expect(result.success).toBe(false)
  })
})

// ---- UpsertSubtopicSchema ----------------------------------------------------

describe('UpsertSubtopicSchema', () => {
  it('accepts a valid subtopic', () => {
    const result = UpsertSubtopicSchema.safeParse({
      topic_id: VALID_UUID,
      code: '050-01',
      name: 'The Atmosphere',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID topic_id', () => {
    const result = UpsertSubtopicSchema.safeParse({
      topic_id: INVALID_UUID,
      code: '050-01',
      name: 'The Atmosphere',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a code exceeding 30 characters', () => {
    const result = UpsertSubtopicSchema.safeParse({
      topic_id: VALID_UUID,
      code: 'A'.repeat(31),
      name: 'The Atmosphere',
    })
    expect(result.success).toBe(false)
  })
})

// ---- DeleteSyllabusItemSchema ------------------------------------------------

describe('DeleteSyllabusItemSchema', () => {
  it('accepts a valid delete for each table', () => {
    for (const table of ['easa_subjects', 'easa_topics', 'easa_subtopics'] as const) {
      const result = DeleteSyllabusItemSchema.safeParse({ id: VALID_UUID, table })
      expect(result.success).toBe(true)
    }
  })

  it('rejects a non-UUID id', () => {
    const result = DeleteSyllabusItemSchema.safeParse({
      id: INVALID_UUID,
      table: 'easa_subjects',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an unrecognised table name', () => {
    const result = DeleteSyllabusItemSchema.safeParse({ id: VALID_UUID, table: 'easa_questions' })
    expect(result.success).toBe(false)
  })
})
