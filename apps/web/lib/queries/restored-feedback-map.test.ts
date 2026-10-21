import { describe, expect, it } from 'vitest'
import { toClientFeedback } from './restored-feedback-map'

const EXPL = { explanation_text: 'why', explanation_image_url: null }
const CLIENT_EXPL = { explanationText: 'why', explanationImageUrl: null }

describe('toClientFeedback', () => {
  it('maps a multiple-choice element to the client shape', () => {
    const el = {
      question_id: 'q1',
      question_type: 'multiple_choice',
      is_correct: false,
      correct_option_id: 'c',
      ...EXPL,
    }

    expect(toClientFeedback(el)).toEqual({
      questionType: 'multiple_choice',
      isCorrect: false,
      correctOptionId: 'c',
      ...CLIENT_EXPL,
    })
  })

  it('maps a short-answer element to the client shape', () => {
    const el = {
      question_id: 'q2',
      question_type: 'short_answer',
      is_correct: true,
      correct_answer: 'wilco',
      blanks: null,
      ...EXPL,
    }

    expect(toClientFeedback(el)).toEqual({
      questionType: 'short_answer',
      isCorrect: true,
      correctAnswer: 'wilco',
      ...CLIENT_EXPL,
    })
  })

  it('maps a dialog-fill element with per-blank results', () => {
    const el = {
      question_id: 'q3',
      question_type: 'dialog_fill',
      is_correct: false,
      correct_answer: null,
      blanks: [{ index: 0, is_correct: false, canonical: 'roger' }],
      ...EXPL,
    }

    expect(toClientFeedback(el)).toEqual({
      questionType: 'dialog_fill',
      isCorrect: false,
      blanks: [{ index: 0, isCorrect: false, canonical: 'roger' }],
      ...CLIENT_EXPL,
    })
  })

  it('maps an ordering element with its canonical order', () => {
    const el = {
      question_id: 'q4',
      question_type: 'ordering',
      is_correct: false,
      correct_answer: null,
      blanks: null,
      correct_order: ['a', 'b'],
      ...EXPL,
    }

    expect(toClientFeedback(el)).toEqual({
      questionType: 'ordering',
      isCorrect: false,
      correctOrder: ['a', 'b'],
      ...CLIENT_EXPL,
    })
  })

  it('maps a diagram element with its canonical zone-to-label mapping', () => {
    const el = {
      question_id: 'q5',
      question_type: 'diagram_label',
      is_correct: true,
      correct_answer: null,
      blanks: null,
      correct_mapping: [{ zone_id: 'z1', label_id: 'l1' }],
      ...EXPL,
    }

    expect(toClientFeedback(el)).toEqual({
      questionType: 'diagram_label',
      isCorrect: true,
      correctMapping: [{ zoneId: 'z1', labelId: 'l1' }],
      ...CLIENT_EXPL,
    })
  })

  it.each([
    ['an unknown question type', { question_id: 'q', question_type: 'essay', is_correct: true }],
    [
      'a multiple-choice element without a key',
      { question_id: 'q', question_type: 'multiple_choice', is_correct: true, ...EXPL },
    ],
    [
      'an ordering element with a single item',
      {
        question_id: 'q',
        question_type: 'ordering',
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_order: ['a'],
        ...EXPL,
      },
    ],
    ['a non-object element', 'nope'],
  ])('rejects %s', (_label, el) => {
    expect(toClientFeedback(el)).toBeNull()
  })
})
