import { describe, expect, it } from 'vitest'
import { buildInitialFormState } from './build-initial-form-state'
import { buildQuestionPayload } from './question-payload'

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
