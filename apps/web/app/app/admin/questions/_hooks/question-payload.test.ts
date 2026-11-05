import { describe, expect, it } from 'vitest'
import { buildInitialFormState } from './build-initial-form-state'
import { buildQuestionPayload, canSubmitQuestion } from './question-payload'

const state = { ...buildInitialFormState(undefined, 'b'), questionNumber: '', loReference: 'LO-1' }

describe('buildQuestionPayload', () => {
  it('omits the id when creating a question', () => {
    expect(buildQuestionPayload(state, undefined)).not.toHaveProperty('id')
  })

  it('carries the id when editing a question', () => {
    expect(buildQuestionPayload(state, 'q-1')).toMatchObject({ id: 'q-1' })
  })

  it('sends empty optional text fields as null and keeps the chosen answer key', () => {
    expect(buildQuestionPayload(state, undefined)).toMatchObject({
      question_number: null,
      lo_reference: 'LO-1',
      question_image_url: null,
      correct_option_id: 'b',
    })
  })
})

describe('canSubmitQuestion', () => {
  const filled = {
    ...buildInitialFormState(undefined, 'a'),
    subjectId: 's-1',
    topicId: 't-1',
    questionText: 'Q?',
    options: (['a', 'b', 'c', 'd'] as const).map((id) => ({ id, text: `Option ${id}` })),
    explanationText: 'Because.',
  }

  it('accepts a fully filled form', () => {
    expect(canSubmitQuestion(filled)).toBe(true)
  })

  it.each([
    ['subject', { subjectId: undefined }],
    ['topic', { topicId: undefined }],
    ['question text', { questionText: '  ' }],
    [
      'an option text',
      { options: filled.options.map((o, i) => (i === 2 ? { ...o, text: ' ' } : o)) },
    ],
    ['correct option', { correctOptionId: '' as const }],
    ['explanation', { explanationText: '' }],
  ])('rejects a missing %s', (_name, patch) => {
    expect(canSubmitQuestion({ ...filled, ...patch })).toBe(false)
  })
})
