import { describe, expect, it } from 'vitest'
import {
  CompleteQuizSessionSchema,
  DeleteSyllabusItemSchema,
  StartQuizSessionSchema,
  SubmitAnswerSchema,
  ToggleExamConfigSchema,
  UpsertExamConfigSchema,
  UpsertQuestionSchema,
  UpsertSubjectSchema,
  UpsertSubtopicSchema,
  UpsertTopicSchema,
} from './schema'

const VALID_UUID = '00000000-0000-4000-a000-000000000001'
const INVALID_UUID = 'not-a-uuid'

describe('SubmitAnswerSchema', () => {
  const valid = {
    sessionId: VALID_UUID,
    questionId: VALID_UUID,
    selectedOptionId: 'a',
    responseTimeMs: 1000,
  }

  it('accepts a valid submission', () => {
    expect(SubmitAnswerSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['non-UUID sessionId', { ...valid, sessionId: INVALID_UUID }],
    ['non-UUID questionId', { ...valid, questionId: INVALID_UUID }],
    ['option outside enum', { ...valid, selectedOptionId: 'e' }],
    ['zero responseTimeMs', { ...valid, responseTimeMs: 0 }],
    ['negative responseTimeMs', { ...valid, responseTimeMs: -100 }],
    ['fractional responseTimeMs', { ...valid, responseTimeMs: 1.5 }],
  ])('rejects %s', (_, payload) => {
    expect(SubmitAnswerSchema.safeParse(payload).success).toBe(false)
  })
})

describe('StartQuizSessionSchema', () => {
  const valid = {
    mode: 'quick_quiz' as const,
    subjectId: VALID_UUID,
    topicId: VALID_UUID,
    questionIds: [VALID_UUID],
  }

  it('accepts a valid session with all fields', () => {
    expect(StartQuizSessionSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts null subjectId and null topicId', () => {
    expect(
      StartQuizSessionSchema.safeParse({ ...valid, subjectId: null, topicId: null }).success,
    ).toBe(true)
  })

  it.each([
    ['empty questionIds', { ...valid, questionIds: [] }],
    ['non-UUID in questionIds', { ...valid, questionIds: [INVALID_UUID] }],
    ['unrecognised mode', { ...valid, mode: 'unknown_mode' }],
  ])('rejects %s', (_, payload) => {
    expect(StartQuizSessionSchema.safeParse(payload).success).toBe(false)
  })
})

describe('CompleteQuizSessionSchema', () => {
  it('accepts a valid UUID sessionId', () => {
    expect(CompleteQuizSessionSchema.safeParse({ sessionId: VALID_UUID }).success).toBe(true)
  })

  it.each([
    ['non-UUID sessionId', { sessionId: INVALID_UUID }],
    ['missing sessionId', {}],
  ])('rejects %s', (_, payload) => {
    expect(CompleteQuizSessionSchema.safeParse(payload).success).toBe(false)
  })
})

describe('UpsertSubjectSchema', () => {
  const valid = { code: 'MET', name: 'Meteorology', short: 'MET', sort_order: 1 }

  it('accepts a valid subject without id (create)', () => {
    expect(UpsertSubjectSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a valid subject with UUID id (update)', () => {
    expect(UpsertSubjectSchema.safeParse({ ...valid, id: VALID_UUID }).success).toBe(true)
  })

  it.each([
    ['non-UUID id', { ...valid, id: INVALID_UUID }],
    ['empty code', { ...valid, code: '' }],
    ['code exceeding 10 chars', { ...valid, code: 'TOOLONGCODE' }],
  ])('rejects %s', (_, payload) => {
    expect(UpsertSubjectSchema.safeParse(payload).success).toBe(false)
  })
})

describe('UpsertTopicSchema', () => {
  const valid = { subject_id: VALID_UUID, code: '050', name: 'Meteorology' }

  it('accepts a valid topic', () => {
    expect(UpsertTopicSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['non-UUID subject_id', { ...valid, subject_id: INVALID_UUID }],
    ['empty name', { ...valid, name: '' }],
  ])('rejects %s', (_, payload) => {
    expect(UpsertTopicSchema.safeParse(payload).success).toBe(false)
  })
})

describe('UpsertSubtopicSchema', () => {
  const valid = { topic_id: VALID_UUID, code: '050-01', name: 'The Atmosphere' }

  it('accepts a valid subtopic', () => {
    expect(UpsertSubtopicSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['non-UUID topic_id', { ...valid, topic_id: INVALID_UUID }],
    ['code exceeding 30 chars', { ...valid, code: 'A'.repeat(31) }],
  ])('rejects %s', (_, payload) => {
    expect(UpsertSubtopicSchema.safeParse(payload).success).toBe(false)
  })
})

describe('UpsertQuestionSchema', () => {
  const validOptions = [
    { id: 'a', text: 'Opt A', correct: true },
    { id: 'b', text: 'Opt B', correct: false },
    { id: 'c', text: 'Opt C', correct: false },
    { id: 'd', text: 'Opt D', correct: false },
  ]

  const valid = {
    subject_id: VALID_UUID,
    topic_id: VALID_UUID,
    subtopic_id: null,
    question_text: 'What is QNH?',
    options: validOptions,
    explanation_text: 'QNH is the altimeter subscale setting.',
    difficulty: 'medium',
    status: 'active',
  }

  it('accepts a valid question with all required fields', () => {
    expect(UpsertQuestionSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects when no option is marked correct', () => {
    const options = validOptions.map((o) => ({ ...o, correct: false }))
    expect(UpsertQuestionSchema.safeParse({ ...valid, options }).success).toBe(false)
  })

  it('rejects when more than one option is marked correct', () => {
    const options = validOptions.map((o) => ({ ...o, correct: true }))
    expect(UpsertQuestionSchema.safeParse({ ...valid, options }).success).toBe(false)
  })

  it('rejects when duplicate option IDs are supplied', () => {
    const options = [
      { id: 'a', text: 'Opt A', correct: true },
      { id: 'a', text: 'Opt B', correct: false },
      { id: 'a', text: 'Opt C', correct: false },
      { id: 'a', text: 'Opt D', correct: false },
    ]
    expect(UpsertQuestionSchema.safeParse({ ...valid, options }).success).toBe(false)
  })

  it('rejects whitespace-only question_text', () => {
    expect(UpsertQuestionSchema.safeParse({ ...valid, question_text: '   ' }).success).toBe(false)
  })

  it('rejects whitespace-only explanation_text', () => {
    expect(UpsertQuestionSchema.safeParse({ ...valid, explanation_text: '   ' }).success).toBe(
      false,
    )
  })

  it('rejects whitespace-only option text', () => {
    const options = validOptions.map((o, i) => (i === 0 ? { ...o, text: '  ' } : o))
    expect(UpsertQuestionSchema.safeParse({ ...valid, options }).success).toBe(false)
  })

  it('trims leading/trailing whitespace from question_text', () => {
    const result = UpsertQuestionSchema.safeParse({ ...valid, question_text: '  QNH  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.question_text).toBe('QNH')
  })
})

describe('DeleteSyllabusItemSchema', () => {
  it.each([
    'easa_subjects',
    'easa_topics',
    'easa_subtopics',
  ] as const)('accepts table %s', (table) => {
    expect(DeleteSyllabusItemSchema.safeParse({ id: VALID_UUID, table }).success).toBe(true)
  })

  it.each([
    ['non-UUID id', { id: INVALID_UUID, table: 'easa_subjects' }],
    ['unrecognised table', { id: VALID_UUID, table: 'easa_questions' }],
  ])('rejects %s', (_, payload) => {
    expect(DeleteSyllabusItemSchema.safeParse(payload).success).toBe(false)
  })
})

const VALID_UUID_2 = '00000000-0000-4000-a000-000000000002'

describe('UpsertExamConfigSchema', () => {
  const validDistributions = [
    { topicId: VALID_UUID, subtopicId: null, questionCount: 10 },
    { topicId: VALID_UUID_2, subtopicId: null, questionCount: 10 },
  ]

  const valid = {
    subjectId: VALID_UUID,
    enabled: true,
    totalQuestions: 20,
    timeLimitSeconds: 3600,
    passMark: 75,
    distributions: validDistributions,
  }

  it('accepts a valid exam config where distribution sums equal totalQuestions', () => {
    expect(UpsertExamConfigSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts a single-distribution config where its count equals totalQuestions', () => {
    const payload = {
      ...valid,
      totalQuestions: 15,
      distributions: [{ topicId: VALID_UUID, subtopicId: null, questionCount: 15 }],
    }
    expect(UpsertExamConfigSchema.safeParse(payload).success).toBe(true)
  })

  it('accepts a distribution entry without subtopicId (optional field)', () => {
    const payload = {
      ...valid,
      totalQuestions: 5,
      distributions: [{ topicId: VALID_UUID, questionCount: 5 }],
    }
    expect(UpsertExamConfigSchema.safeParse(payload).success).toBe(true)
  })

  it('accepts enabled set to false', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, enabled: false }).success).toBe(true)
  })

  it('accepts totalQuestions at the boundary value of 200', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 200 }]
    expect(
      UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 200, distributions }).success,
    ).toBe(true)
  })

  it('accepts timeLimitSeconds at the boundary value of 14400', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, timeLimitSeconds: 14400 }).success).toBe(
      true,
    )
  })

  it('accepts passMark at the boundary value of 100', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, passMark: 100 }).success).toBe(true)
  })

  it('rejects when distribution counts sum to less than totalQuestions', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 5 }]
    const result = UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 10, distributions })
    expect(result.success).toBe(false)
  })

  it('rejects when distribution counts sum to more than totalQuestions', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 25 }]
    const result = UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 20, distributions })
    expect(result.success).toBe(false)
  })

  it('rejects an empty distributions array', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, distributions: [] }).success).toBe(false)
  })

  it('rejects totalQuestions above 200', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 201 }]
    expect(
      UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 201, distributions }).success,
    ).toBe(false)
  })

  it('rejects totalQuestions of zero', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 0 }]
    expect(
      UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 0, distributions }).success,
    ).toBe(false)
  })

  it('rejects timeLimitSeconds above 14400', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, timeLimitSeconds: 14401 }).success).toBe(
      false,
    )
  })

  it('rejects timeLimitSeconds of zero', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, timeLimitSeconds: 0 }).success).toBe(false)
  })

  it('rejects passMark above 100', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, passMark: 101 }).success).toBe(false)
  })

  it('rejects passMark of zero', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, passMark: 0 }).success).toBe(false)
  })

  it('rejects a non-integer questionCount in a distribution entry', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 10.5 }]
    expect(
      UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 10, distributions }).success,
    ).toBe(false)
  })

  it('rejects a distribution entry with a non-UUID topicId', () => {
    const distributions = [{ topicId: INVALID_UUID, subtopicId: null, questionCount: 20 }]
    expect(UpsertExamConfigSchema.safeParse({ ...valid, distributions }).success).toBe(false)
  })

  it('rejects a non-UUID subjectId', () => {
    expect(UpsertExamConfigSchema.safeParse({ ...valid, subjectId: INVALID_UUID }).success).toBe(
      false,
    )
  })

  it('rejects when totalQuestions is a fractional number', () => {
    const distributions = [{ topicId: VALID_UUID, subtopicId: null, questionCount: 10 }]
    expect(
      UpsertExamConfigSchema.safeParse({ ...valid, totalQuestions: 10.5, distributions }).success,
    ).toBe(false)
  })
})

describe('ToggleExamConfigSchema', () => {
  it('accepts a valid subjectId with enabled true', () => {
    expect(ToggleExamConfigSchema.safeParse({ subjectId: VALID_UUID, enabled: true }).success).toBe(
      true,
    )
  })

  it('accepts a valid subjectId with enabled false', () => {
    expect(
      ToggleExamConfigSchema.safeParse({ subjectId: VALID_UUID, enabled: false }).success,
    ).toBe(true)
  })

  it('rejects a non-UUID subjectId', () => {
    expect(
      ToggleExamConfigSchema.safeParse({ subjectId: INVALID_UUID, enabled: true }).success,
    ).toBe(false)
  })

  it('rejects a missing subjectId', () => {
    expect(ToggleExamConfigSchema.safeParse({ enabled: true }).success).toBe(false)
  })

  it('rejects a missing enabled field', () => {
    expect(ToggleExamConfigSchema.safeParse({ subjectId: VALID_UUID }).success).toBe(false)
  })

  it('rejects a non-boolean enabled value', () => {
    expect(ToggleExamConfigSchema.safeParse({ subjectId: VALID_UUID, enabled: 1 }).success).toBe(
      false,
    )
  })
})
