import { describe, expect, it } from 'vitest'
import { type QuizQuestionRow, toQuestion } from './load-session-question-row'

const base: QuizQuestionRow = {
  id: 'q1',
  question_text: 'Text',
  question_image_url: null,
  question_number: null,
  options: null,
  question_type: 'ordering',
  dialog_template: null,
  blanks_safe: null,
  ordering_items_shuffled: null,
  diagram_config_public: null,
}

describe('toQuestion', () => {
  it('maps absent explanation columns to null', () => {
    const q = toQuestion(base)
    expect(q.explanation_text).toBeNull()
    expect(q.explanation_image_url).toBeNull()
  })

  it('keeps explanation values when the row carries them', () => {
    const q = toQuestion({ ...base, explanation_text: 'why', explanation_image_url: 'u' })
    expect(q.explanation_text).toBe('why')
    expect(q.explanation_image_url).toBe('u')
  })

  it('keeps ordering items when ids are unique and non-blank', () => {
    const items = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ]
    expect(toQuestion({ ...base, ordering_items_shuffled: items }).ordering_items).toEqual(items)
  })

  it('drops ordering items with duplicate ids', () => {
    const items = [
      { id: 'a', text: 'A' },
      { id: 'a', text: 'B' },
    ]
    expect(toQuestion({ ...base, ordering_items_shuffled: items }).ordering_items).toBeNull()
  })

  it('drops ordering items with a blank text', () => {
    const items = [
      { id: 'a', text: 'A' },
      { id: 'b', text: '  ' },
    ]
    expect(toQuestion({ ...base, ordering_items_shuffled: items }).ordering_items).toBeNull()
  })
})
