import { describe, expect, it } from 'vitest'
import { restrictDraftToQuestions } from './restrict-draft-to-questions'

const questions = [{ id: 'q1' }, { id: 'q2' }]

describe('restrictDraftToQuestions', () => {
  it('drops draft answers and feedback for questions that are no longer served', () => {
    const result = restrictDraftToQuestions(
      {
        draftAnswers: { q1: { selectedOptionId: 'a' }, gone: { selectedOptionId: 'b' } },
        draftFeedback: { q2: { isCorrect: true }, gone: { isCorrect: false } },
      } as never,
      questions,
    )
    expect(Object.keys(result.answers ?? {})).toEqual(['q1'])
    expect([...(result.feedback?.keys() ?? [])]).toEqual(['q2'])
  })

  it('leaves answers, feedback and index undefined when the draft has none', () => {
    const result = restrictDraftToQuestions({}, questions)
    expect(result).toEqual({ answers: undefined, feedback: undefined, index: undefined })
  })

  it('clamps a resume index past the last question to the last question', () => {
    expect(restrictDraftToQuestions({ draftCurrentIndex: 9 }, questions).index).toBe(1)
  })
})
