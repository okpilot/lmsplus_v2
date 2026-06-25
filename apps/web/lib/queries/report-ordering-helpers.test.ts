import { describe, expect, it } from 'vitest'
import type { QuizReportQuestion } from './quiz-report'
import type { AnswerKeyEntry, AnswerRow, QuestionRow } from './report-question-builder'
import { buildReportQuestions } from './report-question-builder'

// Narrow the discriminated union to the ordering variant for asserting fields.
function asOrdering(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'ordering') throw new Error('expected ordering')
  return q
}

function orderingQuestionMap(): Map<string, QuestionRow> {
  return new Map<string, QuestionRow>([
    [
      'q1',
      {
        id: 'q1',
        question_text: 'Order the distress call.',
        question_number: '092-03-001',
        question_type: 'ordering',
        options: [],
        explanation_text: null,
        explanation_image_url: null,
        question_image_url: null,
      },
    ],
  ])
}

describe('buildOrdering', () => {
  it('collapses multiple ordering slot rows into one entry per question', () => {
    // Three answer rows for ONE ordering question (one per slot position).
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'mayday',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 5000,
        response_text: 'callsign',
        blank_index: 1,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'intentions',
        blank_index: 2,
      },
    ]
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'ordering',
          canonicalBySlot: new Map([
            [0, 'mayday'],
            [1, 'position'],
            [2, 'intentions'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, orderingQuestionMap(), new Map(), answerKeyMap)

    // The key safety guarantee: one entry per question, not per slot row.
    expect(result).toHaveLength(1)
    const ord = asOrdering(result[0])
    expect(ord.totalItems).toBe(3)
    expect(ord.correctCount).toBe(2)
    expect(ord.isCorrect).toBe(false)
    expect(ord.slots.map((s) => s.position)).toEqual([0, 1, 2])
    expect(ord.slots[1]?.canonicalText).toBe('position')
    expect(ord.slots[1]?.responseText).toBe('callsign')
  })

  it('orders ordering slots by position even when answer rows arrive out of order', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 's2',
        blank_index: 2,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 's0',
        blank_index: 0,
      },
    ]

    const result = buildReportQuestions(answers, orderingQuestionMap(), new Map(), new Map())
    const ord = asOrdering(result[0])
    expect(ord.slots.map((s) => s.position)).toEqual([0, 2])
  })

  it('marks an ordering question correct only when every position is correct', () => {
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

    const result = buildReportQuestions(answers, orderingQuestionMap(), new Map(), new Map())
    const ord = asOrdering(result[0])
    expect(ord.correctCount).toBe(2)
    expect(ord.isCorrect).toBe(true)
  })

  it('renders an omitted ordering slot as unanswered using the answer-key canonical order', () => {
    // Only 2 of the question's 3 canonical slots were submitted (slot 2 omitted).
    // The report must still show 3 slots, with the missing slot rendered
    // unanswered and isCorrect false — not "2/2 correct".
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'mayday',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'position',
        blank_index: 1,
      },
    ]
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'ordering',
          canonicalBySlot: new Map([
            [0, 'mayday'],
            [1, 'position'],
            [2, 'intentions'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, orderingQuestionMap(), new Map(), answerKeyMap)
    const ord = asOrdering(result[0])
    expect(ord.totalItems).toBe(3)
    expect(ord.correctCount).toBe(2)
    expect(ord.isCorrect).toBe(false)
    expect(ord.slots.map((s) => s.position)).toEqual([0, 1, 2])
    const omitted = ord.slots[2]
    expect(omitted?.responseText).toBeNull()
    expect(omitted?.isCorrect).toBe(false)
    expect(omitted?.canonicalText).toBe('intentions')
  })
})
