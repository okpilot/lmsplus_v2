import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { useTopicTreeState } from './use-topic-tree-state'

// ---- Fixtures ---------------------------------------------------------------

function makeTopic(
  id: string,
  questionCount: number,
  subtopics: { id: string; questionCount: number }[] = [],
): TopicWithSubtopics {
  return {
    id,
    code: `CODE-${id}`,
    name: `Topic ${id}`,
    questionCount,
    subtopics: subtopics.map((st) => ({
      id: st.id,
      code: `CODE-${st.id}`,
      name: `Subtopic ${st.id}`,
      questionCount: st.questionCount,
    })),
  }
}

const TOPIC_A = makeTopic('t-a', 20, [
  { id: 'st-a1', questionCount: 10 },
  { id: 'st-a2', questionCount: 10 },
])
const TOPIC_B = makeTopic('t-b', 15)

// ---- No initialTopics ---------------------------------------------------------

describe('useTopicTreeState — no initialTopics', () => {
  it('starts empty when initialTopics is omitted', () => {
    const { result } = renderHook(() => useTopicTreeState())
    expect(result.current.topics).toHaveLength(0)
    expect(result.current.checkedTopics.size).toBe(0)
    expect(result.current.checkedSubtopics.size).toBe(0)
  })
})

// ---- Seeded from initialTopics -------------------------------------------------

describe('useTopicTreeState — seeded from initialTopics', () => {
  it('seeds topics from initialTopics', () => {
    const { result } = renderHook(() => useTopicTreeState([TOPIC_A, TOPIC_B]))
    expect(result.current.topics).toEqual([TOPIC_A, TOPIC_B])
  })

  it('checks all seeded topics by default', () => {
    const { result } = renderHook(() => useTopicTreeState([TOPIC_A, TOPIC_B]))
    expect(result.current.checkedTopics.has('t-a')).toBe(true)
    expect(result.current.checkedTopics.has('t-b')).toBe(true)
  })

  it('checks all seeded subtopics by default', () => {
    const { result } = renderHook(() => useTopicTreeState([TOPIC_A, TOPIC_B]))
    expect(result.current.checkedSubtopics.has('st-a1')).toBe(true)
    expect(result.current.checkedSubtopics.has('st-a2')).toBe(true)
  })
})

// ---- Setters --------------------------------------------------------------

describe('useTopicTreeState — setters', () => {
  it('updates topics via setTopics', () => {
    const { result } = renderHook(() => useTopicTreeState())
    act(() => result.current.setTopics([TOPIC_A]))
    expect(result.current.topics).toEqual([TOPIC_A])
  })

  it('updates checkedTopics via setCheckedTopics', () => {
    const { result } = renderHook(() => useTopicTreeState())
    act(() => result.current.setCheckedTopics(new Set(['t-a'])))
    expect(result.current.checkedTopics.has('t-a')).toBe(true)
  })

  it('updates checkedSubtopics via setCheckedSubtopics', () => {
    const { result } = renderHook(() => useTopicTreeState())
    act(() => result.current.setCheckedSubtopics(new Set(['st-a1'])))
    expect(result.current.checkedSubtopics.has('st-a1')).toBe(true)
  })
})
