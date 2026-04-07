import { describe, expect, it } from 'vitest'
import type { AnswerRow, QuestionRow } from './report-question-builder'
import { buildReportQuestions } from './report-question-builder'

describe('buildReportQuestions', () => {
  it('maps answers, questions, and correct options into report format', () => {
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
          options: [
            { id: 'o1', text: '3' },
            { id: 'o2', text: '5' },
          ],
          explanation_text: 'The answer is 4.',
          explanation_image_url: null,
        },
      ],
    ])

    const correctMap = new Map([['q1', 'o1']])

    const result = buildReportQuestions(answers, questionMap, correctMap)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      questionId: 'q1',
      questionText: 'What is 2+2?',
      questionNumber: '1.1',
      isCorrect: false,
      selectedOptionId: 'o2',
      correctOptionId: 'o1',
      options: [
        { id: 'o1', text: '3' },
        { id: 'o2', text: '5' },
      ],
      explanationText: 'The answer is 4.',
      explanationImageUrl: null,
      responseTimeMs: 5000,
    })
  })

  it('handles missing question gracefully', () => {
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

    expect(result[0]).toMatchObject({
      questionId: 'missing',
      questionText: '',
      questionNumber: null,
      correctOptionId: '',
      options: [],
    })
  })
})
