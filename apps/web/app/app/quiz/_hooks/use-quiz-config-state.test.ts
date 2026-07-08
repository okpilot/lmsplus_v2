import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { useFilteredCount } from './use-filtered-count'
import { useQuizConfigState } from './use-quiz-config-state'
import type { useTopicTree } from './use-topic-tree'

function buildMockFc(): ReturnType<typeof useFilteredCount> {
  return {
    filteredCount: null,
    filteredByTopic: null,
    filteredBySubtopic: null,
    isFilterPending: false,
    authError: false,
    refetch: vi.fn(),
    reset: vi.fn(),
  }
}

function buildMockTopicTree(): ReturnType<typeof useTopicTree> {
  return {
    topics: [],
    checkedTopics: new Set(),
    checkedSubtopics: new Set(),
    allSelected: false,
    isPending: false,
    totalQuestions: 0,
    selectedQuestionCount: 0,
    loadTopics: vi.fn(),
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
    reset: vi.fn(),
    getSelectedTopicIds: vi.fn(() => []),
    getSelectedSubtopicIds: vi.fn(() => []),
  }
}

const SUBJECT_ID = '00000000-0000-4000-a000-000000000005'

describe('useQuizConfigState — initial state defaults', () => {
  it('starts with an empty subject id and discovery mode when no init params are given', () => {
    const { result } = renderHook(() =>
      useQuizConfigState({ fc: buildMockFc(), topicTree: buildMockTopicTree() }),
    )
    expect(result.current.subjectId).toBe('')
    expect(result.current.mode).toBe('discovery')
  })
})

describe('useQuizConfigState — seeded from init params', () => {
  it('seeds subjectId from initialSubjectId when provided', () => {
    const { result } = renderHook(() =>
      useQuizConfigState({
        fc: buildMockFc(),
        topicTree: buildMockTopicTree(),
        initialSubjectId: SUBJECT_ID,
      }),
    )
    expect(result.current.subjectId).toBe(SUBJECT_ID)
  })

  it('seeds mode from initialMode when provided', () => {
    const { result } = renderHook(() =>
      useQuizConfigState({
        fc: buildMockFc(),
        topicTree: buildMockTopicTree(),
        initialMode: 'study',
      }),
    )
    expect(result.current.mode).toBe('study')
  })

  it('seeds both subjectId and mode together', () => {
    const { result } = renderHook(() =>
      useQuizConfigState({
        fc: buildMockFc(),
        topicTree: buildMockTopicTree(),
        initialSubjectId: SUBJECT_ID,
        initialMode: 'study',
      }),
    )
    expect(result.current.subjectId).toBe(SUBJECT_ID)
    expect(result.current.mode).toBe('study')
  })
})
