import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz'

// ---- Mocks ------------------------------------------------------------------

const { mockFetchTopicsWithSubtopics } = vi.hoisted(() => ({
  mockFetchTopicsWithSubtopics: vi.fn(),
}))

vi.mock('../actions/lookup', () => ({
  fetchTopicsWithSubtopics: (...args: unknown[]) => mockFetchTopicsWithSubtopics(...args),
}))

// ---- Subject under test -----------------------------------------------------

import { useTopicTree } from './use-topic-tree'

// ---- Fixtures ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

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
const TOPIC_B = makeTopic('t-b', 15) // leaf topic — no subtopics

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchTopicsWithSubtopics.mockResolvedValue([TOPIC_A, TOPIC_B])
})

// ---- Initial state ----------------------------------------------------------

describe('useTopicTree — initial state', () => {
  it('starts with empty topics, no checked items, and zero counts', () => {
    const { result } = renderHook(() => useTopicTree())
    expect(result.current.topics).toHaveLength(0)
    expect(result.current.checkedTopics.size).toBe(0)
    expect(result.current.checkedSubtopics.size).toBe(0)
    expect(result.current.totalQuestions).toBe(0)
    expect(result.current.selectedQuestionCount).toBe(0)
    expect(result.current.allSelected).toBe(false)
  })
})

// ---- loadTopics -------------------------------------------------------------

describe('useTopicTree — loadTopics', () => {
  it('fetches topics and checks all of them after loading', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    expect(result.current.topics).toHaveLength(2)
    expect(result.current.checkedTopics.has('t-a')).toBe(true)
    expect(result.current.checkedTopics.has('t-b')).toBe(true)
  })

  it('checks all subtopics after loading', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    expect(result.current.checkedSubtopics.has('st-a1')).toBe(true)
    expect(result.current.checkedSubtopics.has('st-a2')).toBe(true)
  })

  it('sets allSelected to true when all topics and subtopics are checked after loading', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    expect(result.current.allSelected).toBe(true)
  })

  it('reports correct totalQuestions after loading', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    // TOPIC_A: 20 + TOPIC_B: 15 = 35
    expect(result.current.totalQuestions).toBe(35)
  })

  it('passes the subjectId to the server action', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    expect(mockFetchTopicsWithSubtopics).toHaveBeenCalledWith(SUBJECT_ID)
  })
})

// ---- toggleTopic ------------------------------------------------------------

describe('useTopicTree — toggleTopic', () => {
  async function loadedHook() {
    const hook = renderHook(() => useTopicTree())
    await act(async () => hook.result.current.loadTopics(SUBJECT_ID))
    return hook
  }

  it('unchecks a checked topic and its subtopics', async () => {
    const { result } = await loadedHook()
    act(() => result.current.toggleTopic('t-a'))

    expect(result.current.checkedTopics.has('t-a')).toBe(false)
    expect(result.current.checkedSubtopics.has('st-a1')).toBe(false)
    expect(result.current.checkedSubtopics.has('st-a2')).toBe(false)
  })

  it('re-checks an unchecked topic and its subtopics', async () => {
    const { result } = await loadedHook()
    act(() => result.current.toggleTopic('t-a'))
    act(() => result.current.toggleTopic('t-a'))

    expect(result.current.checkedTopics.has('t-a')).toBe(true)
    expect(result.current.checkedSubtopics.has('st-a1')).toBe(true)
    expect(result.current.checkedSubtopics.has('st-a2')).toBe(true)
  })

  it('does nothing when the topicId does not exist', async () => {
    const { result } = await loadedHook()
    const before = result.current.checkedTopics.size
    act(() => result.current.toggleTopic('non-existent'))
    expect(result.current.checkedTopics.size).toBe(before)
  })

  it('does not affect other topics when one is unchecked', async () => {
    const { result } = await loadedHook()
    act(() => result.current.toggleTopic('t-a'))

    expect(result.current.checkedTopics.has('t-b')).toBe(true)
  })
})

// ---- toggleSubtopic ---------------------------------------------------------

describe('useTopicTree — toggleSubtopic', () => {
  async function loadedHook() {
    const hook = renderHook(() => useTopicTree())
    await act(async () => hook.result.current.loadTopics(SUBJECT_ID))
    return hook
  }

  it('unchecks a single subtopic without affecting its siblings', async () => {
    const { result } = await loadedHook()
    act(() => result.current.toggleSubtopic('st-a1', 't-a'))

    expect(result.current.checkedSubtopics.has('st-a1')).toBe(false)
    expect(result.current.checkedSubtopics.has('st-a2')).toBe(true)
  })

  it('unchecks the parent topic when a subtopic is unchecked', async () => {
    const { result } = await loadedHook()
    act(() => result.current.toggleSubtopic('st-a1', 't-a'))

    expect(result.current.checkedTopics.has('t-a')).toBe(false)
  })

  it('re-checks the parent topic when all its subtopics become checked again', async () => {
    const { result } = await loadedHook()
    // Uncheck one subtopic
    act(() => result.current.toggleSubtopic('st-a1', 't-a'))
    expect(result.current.checkedTopics.has('t-a')).toBe(false)

    // Re-check it
    act(() => result.current.toggleSubtopic('st-a1', 't-a'))
    expect(result.current.checkedTopics.has('t-a')).toBe(true)
  })

  it('does nothing when topicId does not match any topic', async () => {
    const { result } = await loadedHook()
    const subtopicsBefore = result.current.checkedSubtopics.size
    act(() => result.current.toggleSubtopic('st-a1', 'non-existent-topic'))
    expect(result.current.checkedSubtopics.size).toBe(subtopicsBefore)
  })
})

// ---- selectAll --------------------------------------------------------------

describe('useTopicTree — selectAll', () => {
  async function loadedHook() {
    const hook = renderHook(() => useTopicTree())
    await act(async () => hook.result.current.loadTopics(SUBJECT_ID))
    return hook
  }

  it('deselects everything when all topics are currently selected', async () => {
    const { result } = await loadedHook()
    expect(result.current.allSelected).toBe(true)

    act(() => result.current.selectAll())

    expect(result.current.checkedTopics.size).toBe(0)
    expect(result.current.checkedSubtopics.size).toBe(0)
  })

  it('selects all topics and subtopics when not all are selected', async () => {
    const { result } = await loadedHook()
    // Uncheck one to break allSelected
    act(() => result.current.toggleTopic('t-a'))
    expect(result.current.allSelected).toBe(false)

    act(() => result.current.selectAll())

    expect(result.current.checkedTopics.has('t-a')).toBe(true)
    expect(result.current.checkedTopics.has('t-b')).toBe(true)
    expect(result.current.checkedSubtopics.has('st-a1')).toBe(true)
    expect(result.current.checkedSubtopics.has('st-a2')).toBe(true)
  })
})

// ---- reset ------------------------------------------------------------------

describe('useTopicTree — reset', () => {
  it('clears topics and all checked state', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))
    expect(result.current.topics).toHaveLength(2)

    act(() => result.current.reset())

    expect(result.current.topics).toHaveLength(0)
    expect(result.current.checkedTopics.size).toBe(0)
    expect(result.current.checkedSubtopics.size).toBe(0)
  })
})

// ---- getSelectedTopicIds / getSelectedSubtopicIds ---------------------------

describe('useTopicTree — selectors', () => {
  it('getSelectedTopicIds returns ids of all checked topics', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    const ids = result.current.getSelectedTopicIds()
    expect(ids).toContain('t-a')
    expect(ids).toContain('t-b')
  })

  it('getSelectedSubtopicIds returns ids of all checked subtopics', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))

    const ids = result.current.getSelectedSubtopicIds()
    expect(ids).toContain('st-a1')
    expect(ids).toContain('st-a2')
  })

  it('getSelectedTopicIds returns empty array after reset', async () => {
    const { result } = renderHook(() => useTopicTree())
    await act(async () => result.current.loadTopics(SUBJECT_ID))
    act(() => result.current.reset())

    expect(result.current.getSelectedTopicIds()).toHaveLength(0)
  })
})
