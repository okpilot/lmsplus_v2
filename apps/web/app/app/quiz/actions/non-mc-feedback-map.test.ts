import { describe, expect, it } from 'vitest'
import {
  toDiagramFeedback,
  toDialogFeedback,
  toOrderingFeedback,
  toShortFeedback,
} from './non-mc-feedback-map'

const EXPL = { explanation_text: 'why', explanation_image_url: null }

describe('non-MC feedback mapping', () => {
  it('maps a short answer result to client feedback', () => {
    expect(
      toShortFeedback({ is_correct: true, correct_answer: 'wilco', blanks: null, ...EXPL }),
    ).toEqual({
      questionType: 'short_answer',
      isCorrect: true,
      correctAnswer: 'wilco',
      explanationText: 'why',
      explanationImageUrl: null,
    })
  })

  it('maps an ordering result to client feedback', () => {
    expect(
      toOrderingFeedback({
        is_correct: false,
        correct_answer: null,
        blanks: null,
        correct_order: ['a', 'b'],
        ...EXPL,
      }),
    ).toEqual({
      questionType: 'ordering',
      isCorrect: false,
      correctOrder: ['a', 'b'],
      explanationText: 'why',
      explanationImageUrl: null,
    })
  })

  it('maps a diagram result to camel-cased zone and label ids', () => {
    expect(
      toDiagramFeedback({
        is_correct: true,
        correct_answer: null,
        blanks: null,
        correct_mapping: [{ zone_id: 'z1', label_id: 'l1' }],
        ...EXPL,
      }),
    ).toEqual({
      questionType: 'diagram_label',
      isCorrect: true,
      correctMapping: [{ zoneId: 'z1', labelId: 'l1' }],
      explanationText: 'why',
      explanationImageUrl: null,
    })
  })

  it('maps a dialog result to client feedback with its blanks', () => {
    const result = toDialogFeedback({ is_correct: true, correct_answer: null, blanks: [], ...EXPL })
    expect(result).toMatchObject({ questionType: 'dialog_fill', isCorrect: true, blanks: [] })
  })
})
