import { describe, expect, it, vi } from 'vitest'
import type { QuestionRow } from '../types'
import {
  buildInitialFormState,
  buildSetterHandlers,
  EMPTY_OPTIONS,
  type FormState,
} from './build-initial-form-state'

const POPULATED_QUESTION: QuestionRow = {
  id: 'q-1',
  question_number: 'Q-42',
  question_text: 'What keeps a wing aloft?',
  difficulty: 'hard',
  status: 'active',
  subject_id: 'subj-1',
  topic_id: 'topic-1',
  subtopic_id: 'subtopic-1',
  subject: { code: '010', name: 'Air Law' },
  topic: { name: 'Topic' },
  subtopic: { name: 'Subtopic' },
  options: [
    { id: 'a', text: 'Magic' },
    { id: 'b', text: 'Lift' },
    { id: 'c', text: 'Hope' },
    { id: 'd', text: 'Drag' },
  ],
  correct_option_id: 'b',
  explanation_text: 'Lift opposes weight.',
  question_image_url: 'https://cdn.example.com/q.png',
  explanation_image_url: 'https://cdn.example.com/e.png',
  lo_reference: 'LO-1.2.3',
  has_calculations: true,
  created_at: '2026-06-12T00:00:00Z',
  updated_at: '2026-06-12T00:00:00Z',
}

describe('buildInitialFormState', () => {
  it('returns empty defaults when no question is provided', () => {
    const state = buildInitialFormState(undefined, '')
    expect(state.subjectId).toBeUndefined()
    expect(state.topicId).toBeUndefined()
    expect(state.subtopicId).toBeNull()
    expect(state.questionNumber).toBe('')
    expect(state.loReference).toBe('')
    expect(state.questionText).toBe('')
    expect(state.options).toEqual(EMPTY_OPTIONS)
    expect(state.correctOptionId).toBe('')
    expect(state.explanationText).toBe('')
    expect(state.questionImageUrl).toBeNull()
    expect(state.explanationImageUrl).toBeNull()
    expect(state.difficulty).toBe('medium')
    expect(state.status).toBe('draft')
    expect(state.hasCalculations).toBe(false)
  })

  it('maps every field from a populated question row', () => {
    const state = buildInitialFormState(POPULATED_QUESTION, 'b')
    expect(state.subjectId).toBe('subj-1')
    expect(state.topicId).toBe('topic-1')
    expect(state.subtopicId).toBe('subtopic-1')
    expect(state.questionNumber).toBe('Q-42')
    expect(state.loReference).toBe('LO-1.2.3')
    expect(state.questionText).toBe('What keeps a wing aloft?')
    expect(state.options).toEqual(POPULATED_QUESTION.options)
    expect(state.explanationText).toBe('Lift opposes weight.')
    expect(state.questionImageUrl).toBe('https://cdn.example.com/q.png')
    expect(state.explanationImageUrl).toBe('https://cdn.example.com/e.png')
    expect(state.difficulty).toBe('hard')
    expect(state.status).toBe('active')
    expect(state.hasCalculations).toBe(true)
  })

  it('uses the explicit initial correct-option id, not the row', () => {
    // The MC answer key is fetched separately (REVOKE-gated), so it is supplied
    // as an explicit argument rather than read off the question row.
    const state = buildInitialFormState(POPULATED_QUESTION, 'd')
    expect(state.correctOptionId).toBe('d')
  })
})

describe('buildSetterHandlers', () => {
  it('exposes a setter for every editable field', () => {
    const handlers = buildSetterHandlers(vi.fn())
    expect(Object.keys(handlers).sort()).toEqual(
      [
        'setSubtopicId',
        'setQuestionNumber',
        'setLoReference',
        'setQuestionText',
        'setOptions',
        'setCorrectOptionId',
        'setExplanationText',
        'setQuestionImageUrl',
        'setExplanationImageUrl',
        'setDifficulty',
        'setStatus',
        'setHasCalculations',
      ].sort(),
    )
  })

  it('forwards each field key and value to the underlying updater', () => {
    const setField = vi.fn<(key: keyof FormState, value: FormState[keyof FormState]) => void>()
    const h = buildSetterHandlers(setField)

    h.setQuestionText('new text')
    expect(setField).toHaveBeenLastCalledWith('questionText', 'new text')

    h.setCorrectOptionId('c')
    expect(setField).toHaveBeenLastCalledWith('correctOptionId', 'c')

    h.setDifficulty('easy')
    expect(setField).toHaveBeenLastCalledWith('difficulty', 'easy')

    h.setStatus('active')
    expect(setField).toHaveBeenLastCalledWith('status', 'active')

    h.setHasCalculations(true)
    expect(setField).toHaveBeenLastCalledWith('hasCalculations', true)

    h.setSubtopicId(null)
    expect(setField).toHaveBeenLastCalledWith('subtopicId', null)
  })
})
