import { describe, expect, it } from 'vitest'
import type { QuizReportQuestion } from './quiz-report'
import type { AnswerKeyEntry, AnswerRow, QuestionRow } from './report-question-builder'
import { buildReportQuestions } from './report-question-builder'

// Narrow the discriminated union to the diagram_label variant for asserting fields.
function asDiagram(q: QuizReportQuestion | undefined) {
  if (q?.questionType !== 'diagram_label') throw new Error('expected diagram_label')
  return q
}

function diagramQuestionMap(): Map<string, QuestionRow> {
  return new Map<string, QuestionRow>([
    [
      'q1',
      {
        id: 'q1',
        question_text: 'Label the pattern legs.',
        question_number: '092-04-001',
        question_type: 'diagram_label',
        options: [],
        explanation_text: null,
        explanation_image_url: null,
        question_image_url: null,
      },
    ],
  ])
}

describe('buildDiagram', () => {
  it('collapses multiple zone placement rows into one entry, all zones correct', () => {
    // Three answer rows for ONE diagram_label question (one per zone).
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'Upwind',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'Crosswind',
        blank_index: 1,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'Downwind',
        blank_index: 2,
      },
    ]
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'diagram_label',
          correctLabelByZone: new Map([
            [0, 'Upwind'],
            [1, 'Crosswind'],
            [2, 'Downwind'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, diagramQuestionMap(), new Map(), answerKeyMap)

    // The key safety guarantee: one entry per question, not per zone row.
    expect(result).toHaveLength(1)
    const diagram = asDiagram(result[0])
    expect(diagram.totalZones).toBe(3)
    expect(diagram.correctCount).toBe(3)
    expect(diagram.isCorrect).toBe(true)
    expect(diagram.zones.map((z) => z.blankIndex)).toEqual([0, 1, 2])
  })

  it('marks a partial submission with a mix of correct and incorrect zones', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'Upwind',
        blank_index: 0,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 5000,
        response_text: 'Downwind',
        blank_index: 1,
      },
    ]
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'diagram_label',
          correctLabelByZone: new Map([
            [0, 'Upwind'],
            [1, 'Crosswind'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, diagramQuestionMap(), new Map(), answerKeyMap)
    const diagram = asDiagram(result[0])
    expect(diagram.totalZones).toBe(2)
    expect(diagram.correctCount).toBe(1)
    expect(diagram.isCorrect).toBe(false)
    const wrongZone = diagram.zones[1]
    expect(wrongZone?.placedLabel).toBe('Downwind')
    expect(wrongZone?.correctLabel).toBe('Crosswind')
    expect(wrongZone?.isCorrect).toBe(false)
  })

  it('renders an unplaced zone as unanswered using the answer-key zone set', () => {
    // Only 1 of the question's 3 configured zones was submitted (zones 1, 2 omitted).
    // The report must still show 3 zones (partial credit is scored against the
    // config's total zone count), with the missing zones rendered unplaced and
    // isCorrect false — not "1/1 correct".
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'Upwind',
        blank_index: 0,
      },
    ]
    const answerKeyMap = new Map<string, AnswerKeyEntry>([
      [
        'q1',
        {
          type: 'diagram_label',
          correctLabelByZone: new Map([
            [0, 'Upwind'],
            [1, 'Crosswind'],
            [2, 'Downwind'],
          ]),
        },
      ],
    ])

    const result = buildReportQuestions(answers, diagramQuestionMap(), new Map(), answerKeyMap)
    const diagram = asDiagram(result[0])
    expect(diagram.totalZones).toBe(3)
    expect(diagram.correctCount).toBe(1)
    expect(diagram.isCorrect).toBe(false)
    expect(diagram.zones.map((z) => z.blankIndex)).toEqual([0, 1, 2])
    const unplaced1 = diagram.zones[1]
    expect(unplaced1?.placedLabel).toBeNull()
    expect(unplaced1?.isCorrect).toBe(false)
    expect(unplaced1?.correctLabel).toBe('Crosswind')
    const unplaced2 = diagram.zones[2]
    expect(unplaced2?.placedLabel).toBeNull()
    expect(unplaced2?.isCorrect).toBe(false)
    expect(unplaced2?.correctLabel).toBe('Downwind')
  })

  it('ignores a null blank_index row when a real zone-0 row coexists', () => {
    // buildDiagram filters rows where blank_index != null before building rowByZone.
    // A stray null-index row must NOT overwrite zone 0.
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 5000,
        response_text: 'corrupt-data',
        blank_index: null,
      },
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: true,
        response_time_ms: 5000,
        response_text: 'Upwind',
        blank_index: 0,
      },
    ]

    const result = buildReportQuestions(answers, diagramQuestionMap(), new Map(), new Map())
    const diagram = asDiagram(result[0])
    // The null-index row is silently dropped — only the real zone-0 row survives.
    expect(diagram.zones).toHaveLength(1)
    expect(diagram.zones[0]?.blankIndex).toBe(0)
    expect(diagram.zones[0]?.placedLabel).toBe('Upwind')
    expect(diagram.zones[0]?.isCorrect).toBe(true)
  })

  it('falls back to submitted rows and defaults correctLabel to empty string when no answer key is present', () => {
    const answers: AnswerRow[] = [
      {
        question_id: 'q1',
        selected_option_id: null,
        is_correct: false,
        response_time_ms: 5000,
        response_text: 'Upwind',
        blank_index: 0,
      },
    ]

    const result = buildReportQuestions(answers, diagramQuestionMap(), new Map(), new Map())
    const diagram = asDiagram(result[0])
    expect(diagram.zones).toHaveLength(1)
    expect(diagram.zones[0]?.correctLabel).toBe('')
  })
})
