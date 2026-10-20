import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import type { QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'

// Drives the real useTopicTree (real useTransition) so the test sees the actual
// commit order of `isPending` and the loaded topics on a subject switch.

const { mockFetchTopicsWithSubtopics } = vi.hoisted(() => ({
  mockFetchTopicsWithSubtopics: vi.fn(),
}))

vi.mock('../actions/lookup', () => ({
  fetchTopicsWithSubtopics: (...args: unknown[]) => mockFetchTopicsWithSubtopics(...args),
}))

import { useFilteredCountSync } from './use-filtered-count-sync'
import { useTopicTree } from './use-topic-tree'

const SUBJECT_A = '00000000-0000-4000-a000-00000000000a'
const SUBJECT_B = '00000000-0000-4000-a000-00000000000b'

function tree(topicId: string, subtopicId: string): TopicWithSubtopics[] {
  return [
    {
      id: topicId,
      code: 'T',
      name: 'Topic',
      questionCount: 3,
      subtopics: [{ id: subtopicId, code: 'S', name: 'Subtopic', questionCount: 3 }],
    },
  ]
}

const TREE_A = tree('topic-a', 'sub-a')
const TREE_B = tree('topic-b', 'sub-b')

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderConfig(opts: {
  hasActiveFilters: boolean
  filters: QuestionFilterValue[]
  questionType?: 'multiple_choice'
}) {
  const fc = { refetch: vi.fn() } as unknown as ReturnType<typeof useFilteredCount>
  const hook = renderHook(() => {
    const [subjectId, setSubjectId] = useState('')
    const topicTree = useTopicTree()
    useFilteredCountSync({
      subjectId,
      calcMode: 'all',
      imageMode: 'all',
      topicTree,
      fc,
      ...opts,
    })
    return {
      pick: (id: string) => {
        setSubjectId(id)
        topicTree.loadTopics(id)
      },
    }
  })
  return { fc, ...hook }
}

async function switchSubjects(result: { current: { pick: (id: string) => void } }) {
  mockFetchTopicsWithSubtopics.mockResolvedValueOnce(TREE_A)
  await act(async () => result.current.pick(SUBJECT_A))

  const pendingB = deferred<TopicWithSubtopics[]>()
  mockFetchTopicsWithSubtopics.mockReturnValueOnce(pendingB.promise)
  await act(async () => result.current.pick(SUBJECT_B))
  await act(async () => pendingB.resolve(TREE_B))
}

function subjectTopicPairs(fc: ReturnType<typeof useFilteredCount>) {
  return vi.mocked(fc.refetch).mock.calls.map(([subject, topicIds]) => [subject, topicIds])
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useFilteredCountSync with the real topic tree', () => {
  it('never counts the new subject against the previous subject topics in Discovery', async () => {
    const { fc, result } = renderConfig({
      hasActiveFilters: false,
      filters: ['all'],
      questionType: 'multiple_choice',
    })

    await switchSubjects(result)

    expect(subjectTopicPairs(fc)).toEqual([
      [SUBJECT_A, ['topic-a']],
      [SUBJECT_B, ['topic-b']],
    ])
  })

  it('never counts the new subject against the previous subject topics with an active filter', async () => {
    const { fc, result } = renderConfig({ hasActiveFilters: true, filters: ['unseen'] })

    await switchSubjects(result)

    expect(subjectTopicPairs(fc)).toEqual([
      [SUBJECT_A, ['topic-a']],
      [SUBJECT_B, ['topic-b']],
    ])
  })
})
