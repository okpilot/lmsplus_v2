import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionOption, QuestionRow } from '../types'
import { useQuestionFormState } from './use-question-form-state'

const EMPTY_OPTIONS: QuestionOption[] = [
  { id: 'a', text: '', correct: false },
  { id: 'b', text: '', correct: false },
  { id: 'c', text: '', correct: false },
  { id: 'd', text: '', correct: false },
]

const QUESTION_OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Option A', correct: true },
  { id: 'b', text: 'Option B', correct: false },
  { id: 'c', text: 'Option C', correct: false },
  { id: 'd', text: 'Option D', correct: false },
]

const MOCK_QUESTION: QuestionRow = {
  id: 'q-1',
  question_number: 'MET-001',
  question_text: 'What is METAR?',
  difficulty: 'easy',
  status: 'active',
  subject_id: 'subj-1',
  topic_id: 'topic-1',
  subtopic_id: 'subtopic-1',
  subject: { code: 'MET', name: 'Meteorology' },
  topic: { name: 'Clouds' },
  subtopic: { name: 'Cloud types' },
  options: QUESTION_OPTIONS,
  explanation_text: 'METAR is a weather report.',
  question_image_url: 'https://example.com/image.png',
  explanation_image_url: null,
  lo_reference: 'LO-1.2',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
}

describe('useQuestionFormState', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('initial state with a question prop', () => {
    it('populates all fields from the question', () => {
      const { result } = renderHook(() => useQuestionFormState(MOCK_QUESTION, true))

      const { state } = result.current
      expect(state.subjectId).toBe('subj-1')
      expect(state.topicId).toBe('topic-1')
      expect(state.subtopicId).toBe('subtopic-1')
      expect(state.questionNumber).toBe('MET-001')
      expect(state.loReference).toBe('LO-1.2')
      expect(state.questionText).toBe('What is METAR?')
      expect(state.options).toEqual(QUESTION_OPTIONS)
      expect(state.explanationText).toBe('METAR is a weather report.')
      expect(state.questionImageUrl).toBe('https://example.com/image.png')
      expect(state.explanationImageUrl).toBeNull()
      expect(state.difficulty).toBe('easy')
      expect(state.status).toBe('active')
    })
  })

  describe('initial state with no question', () => {
    it('uses default values when question is undefined', () => {
      const { result } = renderHook(() => useQuestionFormState(undefined, true))

      const { state } = result.current
      expect(state.subjectId).toBeUndefined()
      expect(state.topicId).toBeUndefined()
      expect(state.subtopicId).toBeNull()
      expect(state.questionNumber).toBe('')
      expect(state.loReference).toBe('')
      expect(state.questionText).toBe('')
      expect(state.options).toEqual(EMPTY_OPTIONS)
      expect(state.explanationText).toBe('')
      expect(state.questionImageUrl).toBeNull()
      expect(state.explanationImageUrl).toBeNull()
      expect(state.difficulty).toBe('medium')
      expect(state.status).toBe('draft')
    })
  })

  describe('handleSubjectChange', () => {
    it('sets subjectId, clears topicId to undefined, and clears subtopicId to null', () => {
      const { result } = renderHook(() => useQuestionFormState(MOCK_QUESTION, true))

      act(() => {
        result.current.handlers.handleSubjectChange('subj-2')
      })

      expect(result.current.state.subjectId).toBe('subj-2')
      expect(result.current.state.topicId).toBeUndefined()
      expect(result.current.state.subtopicId).toBeNull()
    })

    it('does not affect other state fields', () => {
      const { result } = renderHook(() => useQuestionFormState(MOCK_QUESTION, true))

      act(() => {
        result.current.handlers.handleSubjectChange('subj-new')
      })

      expect(result.current.state.questionText).toBe('What is METAR?')
      expect(result.current.state.difficulty).toBe('easy')
    })
  })

  describe('handleTopicChange', () => {
    it('sets topicId and clears subtopicId to null', () => {
      const { result } = renderHook(() => useQuestionFormState(MOCK_QUESTION, true))

      act(() => {
        result.current.handlers.handleTopicChange('topic-2')
      })

      expect(result.current.state.topicId).toBe('topic-2')
      expect(result.current.state.subtopicId).toBeNull()
    })

    it('does not change subjectId', () => {
      const { result } = renderHook(() => useQuestionFormState(MOCK_QUESTION, true))

      act(() => {
        result.current.handlers.handleTopicChange('topic-2')
      })

      expect(result.current.state.subjectId).toBe('subj-1')
    })
  })

  describe('reset on dialog close', () => {
    it('resets all fields to question prop values when open changes from true to false', () => {
      const { result, rerender } = renderHook(
        ({ open }: { open: boolean }) => useQuestionFormState(MOCK_QUESTION, open),
        { initialProps: { open: true } },
      )

      // Mutate some fields while open
      act(() => {
        result.current.handlers.setQuestionText('Changed text')
        result.current.handlers.setDifficulty('hard')
        result.current.handlers.handleSubjectChange('subj-99')
      })

      expect(result.current.state.questionText).toBe('Changed text')
      expect(result.current.state.difficulty).toBe('hard')
      expect(result.current.state.subjectId).toBe('subj-99')

      // Close the dialog
      rerender({ open: false })

      expect(result.current.state.questionText).toBe('What is METAR?')
      expect(result.current.state.difficulty).toBe('easy')
      expect(result.current.state.subjectId).toBe('subj-1')
      expect(result.current.state.topicId).toBe('topic-1')
      expect(result.current.state.subtopicId).toBe('subtopic-1')
      expect(result.current.state.status).toBe('active')
    })

    it('resets all fields to defaults when question is undefined and dialog closes', () => {
      const { result, rerender } = renderHook(
        ({ open }: { open: boolean }) => useQuestionFormState(undefined, open),
        { initialProps: { open: true } },
      )

      // Mutate some fields while open
      act(() => {
        result.current.handlers.setQuestionText('Typed something')
        result.current.handlers.setDifficulty('hard')
      })

      // Close the dialog
      rerender({ open: false })

      expect(result.current.state.questionText).toBe('')
      expect(result.current.state.difficulty).toBe('medium')
      expect(result.current.state.status).toBe('draft')
      expect(result.current.state.options).toEqual(EMPTY_OPTIONS)
    })
  })

  describe('state preservation while open', () => {
    it('preserves mutations while the dialog stays open', () => {
      const { result } = renderHook(() => useQuestionFormState(MOCK_QUESTION, true))

      act(() => {
        result.current.handlers.setQuestionText('Updated question text')
        result.current.handlers.setStatus('draft')
      })

      expect(result.current.state.questionText).toBe('Updated question text')
      expect(result.current.state.status).toBe('draft')
    })
  })
})
