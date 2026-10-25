import { describe, expect, it } from 'vitest'
import {
  isQuestionType,
  QUESTION_TYPES,
  type QuizQuestionRow,
  toQuestion,
} from './load-session-question-row'

const KNOWN_TYPES = ['multiple_choice', 'short_answer', 'dialog_fill', 'ordering', 'diagram_label']

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
    expect(q?.explanation_text).toBeNull()
    expect(q?.explanation_image_url).toBeNull()
  })

  it('keeps explanation values when the row carries them', () => {
    const q = toQuestion({ ...base, explanation_text: 'why', explanation_image_url: 'u' })
    expect(q?.explanation_text).toBe('why')
    expect(q?.explanation_image_url).toBe('u')
  })

  it('keeps ordering items when ids are unique and non-blank', () => {
    const items = [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ]
    expect(toQuestion({ ...base, ordering_items_shuffled: items })?.ordering_items).toEqual(items)
  })

  it('drops ordering items with duplicate ids', () => {
    const items = [
      { id: 'a', text: 'A' },
      { id: 'a', text: 'B' },
    ]
    expect(toQuestion({ ...base, ordering_items_shuffled: items })?.ordering_items).toBeNull()
  })

  it('drops ordering items with a blank text', () => {
    const items = [
      { id: 'a', text: 'A' },
      { id: 'b', text: '  ' },
    ]
    expect(toQuestion({ ...base, ordering_items_shuffled: items })?.ordering_items).toBeNull()
  })

  it('returns null for an unknown question_type', () => {
    expect(toQuestion({ ...base, question_type: 'essay' })).toBeNull()
  })
})

describe('isQuestionType', () => {
  it('accepts exactly the five known question types', () => {
    expect([...(QUESTION_TYPES ?? [])].sort()).toEqual(
      ['diagram_label', 'dialog_fill', 'multiple_choice', 'ordering', 'short_answer'].sort(),
    )
    for (const t of KNOWN_TYPES) expect(isQuestionType(t)).toBe(true)
  })

  it('rejects unknown and non-string values', () => {
    expect(isQuestionType('essay')).toBe(false)
    expect(isQuestionType('')).toBe(false)
    expect(isQuestionType(null)).toBe(false)
    expect(isQuestionType(3)).toBe(false)
  })
})
