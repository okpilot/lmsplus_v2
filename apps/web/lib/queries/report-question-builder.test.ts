import { describe, expect, it } from 'vitest'
import type { QuizReportQuestion } from './quiz-report'
import type { AnswerKeyEntry, AnswerRow, QuestionRow } from './report-question-builder'
import { buildReportQuestions } from './report-question-builder'

// Narrow the discriminated union to a variant for asserting type-specific fields.
function asMc(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'multiple_choice') throw new Error('expected multiple_choice')
  return q
}
function asShortAnswer(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'short_answer') throw new Error('expected short_answer')
  return q
}
function asDialog(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'dialog_fill') throw new Error('expected dialog_fill')
  return q
}

describe('buildReportQuestions', () => {
  it('projects a multiple-choice answer into the MC report variant', () => {
    const answers: AnswerRow[] = [
      { question_id: 'q1', selected_option_id: 'o2', is_correct: false, response_time_ms: 5000 },
    ]

    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'What is 2+2?',
          question_number: '1.1',
          question_type: 'multiple_choice',
          options: [
            { id: 'o1', text: '3' },
            { id: 'o2', text: '5' },
          ],
          explanation_text: 'The answer is 4.',
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const correctMap = new Map([['q1', 'o1']])

    const result = buildReportQuestions(answers, questionMap, correctMap)

    expect(result).toHaveLength(1)
    expect(asMc(result[0])).toEqual({
      questionId: 'q1',
      questionText: 'What is 2+2?',
      questionNumber: '1.1',
      questionType: 'multiple_choice',
      isCorrect: false,
      selectedOptionId: 'o2',
      correctOptionId: 'o1',
      options: [
        { id: 'o1', text: '3' },
        { id: 'o2', text: '5' },
      ],
      explanationText: 'The answer is 4.',
      explanationImageUrl: null,
      questionImageUrl: null,
      responseTimeMs: 5000,
    })
  })

  it('defaults to the MC variant when the question has no type (admin feed)', () => {
    const answers: AnswerRow[] = [
      { question_id: 'q1', selected_option_id: 'o1', is_correct: true, response_time_ms: 1000 },
    ]
    // No question_type field on the question row — the admin MC-only feed omits it.
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Admin MC',
          question_number: null,
          options: [{ id: 'o1', text: 'A' }],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map([['q1', 'o1']]))
    expect(asMc(result[0]).questionType).toBe('multiple_choice')
  })

  // Red-team Vector O: the report payload delivered to the client must never
  // carry a per-option `correct` boolean (that is the answer key). The builder
  // projects options down to exactly { id, text }; this pins that defense even
  // if an upstream row were ever widened to include `correct`.
  it('never leaks a `correct` field on report options, even if the source carries one', () => {
    const answers: AnswerRow[] = [
      { question_id: 'q1', selected_option_id: 'o2', is_correct: false, response_time_ms: 1000 },
    ]
    const leakyOption = { id: 'o1', text: '3', correct: true } as { id: string; text: string }
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'What is 2+2?',
          question_number: '1.1',
          question_type: 'multiple_choice',
          options: [leakyOption, { id: 'o2', text: '5' }],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map([['q1', 'o1']]))

    const options = asMc(result[0]).options
    expect(options).toHaveLength(2)
    for (const opt of options) {
      expect(opt).not.toHaveProperty('correct')
      expect(Object.keys(opt).sort()).toEqual(['id', 'text'])
    }
  })

  it('includes the question image URL in the report when present', () => {
    const answers: AnswerRow[] = [
      { question_id: 'q1', selected_option_id: 'o1', is_correct: true, response_time_ms: 2000 },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'What is lift?',
          question_number: null,
          question_type: 'multiple_choice',
          options: [{ id: 'o1', text: 'Upward force' }],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: 'https://example.com/q-img.png',
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map([['q1', 'o1']]))

    expect(result[0]?.questionImageUrl).toBe('https://example.com/q-img.png')
  })

  it('returns a null selectedOptionId when the answer has no selected option', () => {
    const answers: AnswerRow[] = [
      { question_id: 'q1', selected_option_id: null, is_correct: false, response_time_ms: 4000 },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Describe the procedure.',
          question_number: null,
          question_type: 'multiple_choice',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map())

    expect(asMc(result[0]).selectedOptionId).toBeNull()
  })

  it('handles a missing question gracefully as the MC default variant', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'missing',
        selected_option_id: 'o1',
        is_correct: true,
        response_time_ms: 3000,
      },
    ]
    const questionMap = new Map<string, QuestionRow>()
    const correctMap = new Map<string, string>()

    const result = buildReportQuestions(answers, questionMap, correctMap)

    expect(asMc(result[0])).toMatchObject({
      questionId: 'missing',
      questionText: '',
      questionNumber: null,
      correctOptionId: '',
      options: [],
    })
  })

  it('projects a short-answer row with its canonical answer', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 4000,
        response_text: 'cleared for takeoff',
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Read back the clearance.',
          question_number: '092-01-001',
          question_type: 'short_answer',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      ['q1', { type: 'short_answer', canonical: 'cleared for takeoff' }],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map(), answerKeyMap)

    const sa = asShortAnswer(result[0])
    expect(sa.responseText).toBe('cleared for takeoff')
    expect(sa.canonicalAnswer).toBe('cleared for takeoff')
    expect(sa.isCorrect).toBe(true)
  })

  it('sets canonicalAnswer to null when the short-answer question has no key in the answerKeyMap', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 3000,
        response_text: 'wrong answer',
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Read back the phrase.',
          question_number: null,
          question_type: 'short_answer',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])
    // Empty answerKeyMap — simulates an all-MC session where get_report_answer_keys
    // returns zero rows, or a race where the RPC omits a question's key.
    const result = buildReportQuestions(answers, questionMap, new Map(), new Map())
    const sa = asShortAnswer(result[0])
    expect(sa.canonicalAnswer).toBeNull()
    expect(sa.isCorrect).toBe(false)
    expect(sa.responseText).toBe('wrong answer')
  })

  it('sets responseText to null for a short-answer question with no typed response', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 1500,
        response_text: null,
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Read back the phrase.',
          question_number: null,
          question_type: 'short_answer',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])
    const result = buildReportQuestions(answers, questionMap, new Map(), new Map())
    const sa = asShortAnswer(result[0])
    expect(sa.responseText).toBeNull()
  })

  it('collapses multiple dialog-fill blank rows into one entry per question', () => {
    // Three answer rows for ONE dialog_fill question (one per blank).
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'cleared',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 5000,
        response_text: 'descend',
        blank_index: 1,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'roger',
        blank_index: 2,
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Fill the readback.',
          question_number: '092-02-001',
          question_type: 'dialog_fill',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'dialog_fill',
          canonicalByIndex: new Map([
            [0, 'cleared'],
            [1, 'climb'],
            [2, 'roger'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map(), answerKeyMap)

    // The key safety guarantee: one entry per question, not per row.
    expect(result).toHaveLength(1)
    const df = asDialog(result[0])
    expect(df.totalBlanks).toBe(3)
    expect(df.correctCount).toBe(2)
    expect(df.isCorrect).toBe(false)
    expect(df.blanks.map((b) => b.index)).toEqual([0, 1, 2])
    expect(df.blanks[1]?.canonical).toBe('climb')
    expect(df.blanks[1]?.responseText).toBe('descend')
  })

  it('orders dialog-fill blanks by index even when answer rows arrive out of order', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'b2',
        blank_index: 2,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'b0',
        blank_index: 0,
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Fill it.',
          question_number: null,
          question_type: 'dialog_fill',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map(), new Map())
    const df = asDialog(result[0])
    expect(df.blanks.map((b) => b.index)).toEqual([0, 2])
  })

  it('marks a dialog-fill question correct only when every blank is correct', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'a',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'b',
        blank_index: 1,
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Fill it.',
          question_number: null,
          question_type: 'dialog_fill',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map(), new Map())
    const df = asDialog(result[0])
    expect(df.correctCount).toBe(2)
    expect(df.isCorrect).toBe(true)
  })

  it('renders an omitted dialog blank as unanswered using the answer-key config', () => {
    // Only 2 of the question's 3 configured blanks were submitted (index 2 omitted).
    // The report must still show 3 blanks (the score is computed against the config's
    // total_blanks), with the missing blank rendered unanswered and isCorrect false —
    // not "2/2 correct".
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'cleared',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'climb',
        blank_index: 1,
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'q1',
        {
          id: 'q1',
          question_text: 'Fill the readback.',
          question_number: null,
          question_type: 'dialog_fill',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'dialog_fill',
          canonicalByIndex: new Map([
            [0, 'cleared'],
            [1, 'climb'],
            [2, 'roger'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map(), answerKeyMap)
    const df = asDialog(result[0])
    expect(df.totalBlanks).toBe(3)
    expect(df.correctCount).toBe(2)
    expect(df.isCorrect).toBe(false)
    expect(df.blanks.map((b) => b.index)).toEqual([0, 1, 2])
    const omitted = df.blanks[2]
    expect(omitted?.responseText).toBeNull()
    expect(omitted?.isCorrect).toBe(false)
    expect(omitted?.canonical).toBe('roger')
  })

  it('preserves first-answer order across mixed question types', () => {
    const answers: AnswerRow[] = [
      { question_id: 'qB', selected_option_id: 'o1', is_correct: true, response_time_ms: 1000 },
      {
        question_id: 'qA',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 2000,
        response_text: 'x',
      },
    ]
    const questionMap = new Map<string, QuestionRow>([
      [
        'qB',
        {
          id: 'qB',
          question_text: 'MC',
          question_number: null,
          question_type: 'multiple_choice',
          options: [{ id: 'o1', text: 'A' }],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
      [
        'qA',
        {
          id: 'qA',
          question_text: 'SA',
          question_number: null,
          question_type: 'short_answer',
          options: [],
          explanation_text: null,
          explanation_image_url: null,
          question_image_url: null,
        },
      ],
    ])

    const result = buildReportQuestions(answers, questionMap, new Map([['qB', 'o1']]), new Map())
    expect(result.map((q) => q.questionId)).toEqual(['qB', 'qA'])
  })
})
