import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLockedSubjectLoad } from './use-locked-subject-load'
import type { useTopicTree } from './use-topic-tree'

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

const SUBJECT_ID = '00000000-0000-4000-a000-000000000009'

describe('useLockedSubjectLoad', () => {
  it('loads topics for the given subject id once on mount', () => {
    const topicTree = buildMockTopicTree()
    renderHook(() => useLockedSubjectLoad(topicTree, SUBJECT_ID))
    expect(topicTree.loadTopics).toHaveBeenCalledWith(SUBJECT_ID)
    expect(topicTree.loadTopics).toHaveBeenCalledTimes(1)
  })

  it('does not load topics when no initial subject id is given', () => {
    const topicTree = buildMockTopicTree()
    renderHook(() => useLockedSubjectLoad(topicTree, undefined))
    expect(topicTree.loadTopics).not.toHaveBeenCalled()
  })

  it('does not reload on rerender with the same subject id', () => {
    const topicTree = buildMockTopicTree()
    const { rerender } = renderHook(
      ({ id }: { id: string | undefined }) => useLockedSubjectLoad(topicTree, id),
      { initialProps: { id: SUBJECT_ID } },
    )
    rerender({ id: SUBJECT_ID })
    rerender({ id: SUBJECT_ID })
    expect(topicTree.loadTopics).toHaveBeenCalledTimes(1)
  })
})
