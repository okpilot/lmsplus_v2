import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { createTopicTreeActions } from './topic-tree-actions'

// ---- Mocks ------------------------------------------------------------------

const { mockFetchTopicsWithSubtopics } = vi.hoisted(() => ({
  mockFetchTopicsWithSubtopics: vi.fn(),
}))

vi.mock('../actions/lookup', () => ({
  fetchTopicsWithSubtopics: (...args: unknown[]) => mockFetchTopicsWithSubtopics(...args),
}))

// ---- Fixtures ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

const TOPIC_A: TopicWithSubtopics = {
  id: 't-a',
  code: 'CODE-A',
  name: 'Topic A',
  questionCount: 20,
  subtopics: [
    { id: 'st-a1', code: 'CODE-A1', name: 'Subtopic A1', questionCount: 10 },
    { id: 'st-a2', code: 'CODE-A2', name: 'Subtopic A2', questionCount: 10 },
  ],
}
const TOPIC_B: TopicWithSubtopics = {
  id: 't-b',
  code: 'CODE-B',
  name: 'Topic B',
  questionCount: 15,
  subtopics: [],
}

function makeDeps(overrides: Partial<Parameters<typeof createTopicTreeActions>[0]> = {}) {
  return {
    topics: [TOPIC_A, TOPIC_B],
    checkedTopics: new Set(['t-a', 't-b']),
    checkedSubtopics: new Set(['st-a1', 'st-a2']),
    allSelected: true,
    setTopics: vi.fn(),
    setCheckedTopics: vi.fn(),
    setCheckedSubtopics: vi.fn(),
    setLoading: vi.fn(),
    generation: { current: 0 },
    startTransition: (cb: () => Promise<void> | void) => {
      cb()
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchTopicsWithSubtopics.mockResolvedValue([TOPIC_A, TOPIC_B])
})

// ---- loadTopics ---------------------------------------------------------------

describe('createTopicTreeActions — loadTopics', () => {
  it('fetches topics for the given subjectId and checks them all', async () => {
    const setTopics = vi.fn()
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const { loadTopics } = createTopicTreeActions(
      makeDeps({ setTopics, setCheckedTopics, setCheckedSubtopics }),
    )
    await loadTopics(SUBJECT_ID)

    expect(mockFetchTopicsWithSubtopics).toHaveBeenCalledWith(SUBJECT_ID)
    expect(setTopics).toHaveBeenCalledWith([TOPIC_A, TOPIC_B])
    expect(setCheckedTopics).toHaveBeenCalledWith(new Set(['t-a', 't-b']))
    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set(['st-a1', 'st-a2']))
  })

  it('discards a stale result when a newer load started before it resolved', async () => {
    const setTopics = vi.fn()
    const generation = { current: 0 }
    const { loadTopics } = createTopicTreeActions(makeDeps({ setTopics, generation }))
    const first = loadTopics(SUBJECT_ID)
    generation.current++ // simulate a second load starting before the first resolves
    await first

    expect(setTopics).not.toHaveBeenCalled()
  })
})

// ---- toggleTopic ---------------------------------------------------------------

describe('createTopicTreeActions — toggleTopic', () => {
  it('unchecks a checked topic and its subtopics', () => {
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const { toggleTopic } = createTopicTreeActions(
      makeDeps({ setCheckedTopics, setCheckedSubtopics }),
    )
    toggleTopic('t-a')

    expect(setCheckedTopics).toHaveBeenCalledWith(new Set(['t-b']))
    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set())
  })
})

// ---- toggleSubtopic ---------------------------------------------------------------

describe('createTopicTreeActions — toggleSubtopic', () => {
  it('unchecks a single subtopic and its parent topic', () => {
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const { toggleSubtopic } = createTopicTreeActions(
      makeDeps({ setCheckedTopics, setCheckedSubtopics }),
    )
    toggleSubtopic('st-a1', 't-a')

    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set(['st-a2']))
    expect(setCheckedTopics).toHaveBeenCalledWith(new Set(['t-b']))
  })
})

// ---- selectAll ---------------------------------------------------------------

describe('createTopicTreeActions — selectAll', () => {
  it('deselects everything when allSelected is true', () => {
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const { selectAll } = createTopicTreeActions(
      makeDeps({ allSelected: true, setCheckedTopics, setCheckedSubtopics }),
    )
    selectAll()

    expect(setCheckedTopics).toHaveBeenCalledWith(new Set())
    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set())
  })

  it('selects everything when allSelected is false', () => {
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const { selectAll } = createTopicTreeActions(
      makeDeps({ allSelected: false, setCheckedTopics, setCheckedSubtopics }),
    )
    selectAll()

    expect(setCheckedTopics).toHaveBeenCalledWith(new Set(['t-a', 't-b']))
    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set(['st-a1', 'st-a2']))
  })
})

// ---- reset ---------------------------------------------------------------

describe('createTopicTreeActions — reset', () => {
  it('clears topics and all checked state', () => {
    const setTopics = vi.fn()
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const generation = { current: 0 }
    const { reset } = createTopicTreeActions(
      makeDeps({ setTopics, setCheckedTopics, setCheckedSubtopics, generation }),
    )
    reset()

    expect(setTopics).toHaveBeenCalledWith([])
    expect(setCheckedTopics).toHaveBeenCalledWith(new Set())
    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set())
    expect(generation.current).toBe(1)
  })
})

// ---- applyTopics ------------------------------------------------------------

describe('createTopicTreeActions — applyTopics', () => {
  it('shows the given topics checked without fetching', () => {
    const setTopics = vi.fn()
    const setCheckedTopics = vi.fn()
    const setCheckedSubtopics = vi.fn()
    const { applyTopics } = createTopicTreeActions(
      makeDeps({ setTopics, setCheckedTopics, setCheckedSubtopics }),
    )
    applyTopics([TOPIC_A, TOPIC_B])

    expect(mockFetchTopicsWithSubtopics).not.toHaveBeenCalled()
    expect(setTopics).toHaveBeenCalledWith([TOPIC_A, TOPIC_B])
    expect(setCheckedTopics).toHaveBeenCalledWith(new Set(['t-a', 't-b']))
    expect(setCheckedSubtopics).toHaveBeenCalledWith(new Set(['st-a1', 'st-a2']))
  })

  it('discards the result of a load that was still in flight', async () => {
    let resolveFetch: (v: TopicWithSubtopics[]) => void = () => undefined
    mockFetchTopicsWithSubtopics.mockReturnValue(
      new Promise<TopicWithSubtopics[]>((r) => {
        resolveFetch = r
      }),
    )
    const setTopics = vi.fn()
    const { loadTopics, applyTopics } = createTopicTreeActions(makeDeps({ setTopics }))

    loadTopics(SUBJECT_ID)
    applyTopics([TOPIC_B])
    resolveFetch([TOPIC_A])
    await Promise.resolve()
    await Promise.resolve()

    expect(setTopics).toHaveBeenCalledTimes(1)
    expect(setTopics).toHaveBeenCalledWith([TOPIC_B])
  })
})

// ---- loading flag -------------------------------------------------------------

describe('createTopicTreeActions — loading flag', () => {
  it('marks the tree loading as soon as a load starts', () => {
    const setLoading = vi.fn()
    mockFetchTopicsWithSubtopics.mockReturnValue(new Promise(() => {}))
    const { loadTopics } = createTopicTreeActions(makeDeps({ setLoading }))
    loadTopics(SUBJECT_ID)

    expect(setLoading).toHaveBeenCalledWith(true)
  })

  it('clears loading when the matching load result is applied', async () => {
    const setLoading = vi.fn()
    const { loadTopics } = createTopicTreeActions(makeDeps({ setLoading }))
    await loadTopics(SUBJECT_ID)

    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it('leaves loading untouched when a stale result is discarded', async () => {
    const setLoading = vi.fn()
    const generation = { current: 0 }
    const { loadTopics } = createTopicTreeActions(makeDeps({ setLoading, generation }))
    const first = loadTopics(SUBJECT_ID)
    generation.current++
    await first

    expect(setLoading).not.toHaveBeenCalledWith(false)
  })

  it('clears loading when a preloaded tree is applied', () => {
    const setLoading = vi.fn()
    const { applyTopics } = createTopicTreeActions(makeDeps({ setLoading }))
    applyTopics([TOPIC_B])

    expect(setLoading).toHaveBeenCalledWith(false)
  })

  it('clears loading on reset', () => {
    const setLoading = vi.fn()
    const { reset } = createTopicTreeActions(makeDeps({ setLoading }))
    reset()

    expect(setLoading).toHaveBeenCalledWith(false)
  })
})
