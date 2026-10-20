import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import { useFilteredCountSync } from './use-filtered-count-sync'
import { useTopicTree } from './use-topic-tree'

const { mockFetchTopicsWithSubtopics } = vi.hoisted(() => ({
  mockFetchTopicsWithSubtopics: vi.fn(),
}))

// Only the real-topic-tree describe reaches this; the other tests use a fake topicTree.
vi.mock('../actions/lookup', () => ({
  fetchTopicsWithSubtopics: (...args: unknown[]) => mockFetchTopicsWithSubtopics(...args),
}))

// ---- Fixtures ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID_1 = '00000000-0000-4000-b000-000000000001'
const TOPIC_ID_2 = '00000000-0000-4000-b000-000000000002'
const SUBTOPIC_ID_1 = '00000000-0000-4000-c000-000000000001'
const SUBTOPIC_ID_2 = '00000000-0000-4000-c000-000000000002'

type MinimalTopic = { id: string; subtopics: { id: string }[] }

// The hook reads only `topicTree.topics` (each topic's id + its subtopics' ids) and
// `topicTree.isPending`, so the fixture models just those and casts to the full hook
// return type — the other TopicTree fields are never touched on this path.
function makeTopicTree(
  topics: MinimalTopic[] = [],
  isPending = false,
): ReturnType<typeof useTopicTree> {
  return {
    topics,
    checkedTopics: new Set<string>(),
    checkedSubtopics: new Set<string>(),
    allSelected: false,
    isPending,
    totalQuestions: 0,
    selectedQuestionCount: 0,
    loadTopics: vi.fn(),
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
    reset: vi.fn(),
    getSelectedTopicIds: vi.fn(() => [] as string[]),
    getSelectedSubtopicIds: vi.fn(() => [] as string[]),
  } as unknown as ReturnType<typeof useTopicTree>
}

// Only `fc.refetch` is read by the hook; the rest mirror the real shape for clarity.
function makeFc(): ReturnType<typeof useFilteredCount> {
  return {
    refetch: vi.fn(),
    reset: vi.fn(),
    filteredCount: null as number | null,
    filteredByTopic: null as Record<string, number> | null,
    filteredBySubtopic: null as Record<string, number> | null,
    isFilterPending: false,
    authError: false,
  } as unknown as ReturnType<typeof useFilteredCount>
}

const DEFAULT_FILTERS: QuestionFilterValue[] = ['unseen']
const DEFAULT_CALC_MODE: CalcMode = 'all'
const DEFAULT_IMAGE_MODE: ImageMode = 'all'

type SyncOpts = Parameters<typeof useFilteredCountSync>[0]

function baseOpts(overrides: Partial<SyncOpts> & Pick<SyncOpts, 'topicTree' | 'fc'>): SyncOpts {
  return {
    subjectId: SUBJECT_ID,
    hasActiveFilters: true,
    filters: DEFAULT_FILTERS,
    calcMode: DEFAULT_CALC_MODE,
    imageMode: DEFAULT_IMAGE_MODE,
    ...overrides,
  }
}

// Argument list of fc.refetch(subjectId, topicIds, subtopicIds, filters, calcMode, imageMode, questionType).
function expectedArgs(
  overrides: {
    topicIds?: string[]
    subtopicIds?: string[]
    filters?: QuestionFilterValue[]
    calcMode?: CalcMode
    imageMode?: ImageMode
    questionType?: 'multiple_choice'
  } = {},
) {
  return [
    SUBJECT_ID,
    overrides.topicIds ?? [TOPIC_ID_1],
    overrides.subtopicIds ?? [SUBTOPIC_ID_1],
    overrides.filters ?? DEFAULT_FILTERS,
    overrides.calcMode ?? DEFAULT_CALC_MODE,
    overrides.imageMode ?? DEFAULT_IMAGE_MODE,
    overrides.questionType,
  ] as const
}

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Guard: subjectId empty -------------------------------------------------

describe('useFilteredCountSync — subjectId guard', () => {
  it('does not request a count when subjectId is empty', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    renderHook(() => useFilteredCountSync(baseOpts({ subjectId: '', topicTree, fc })))

    expect(fc.refetch).not.toHaveBeenCalled()
  })
})

// ---- Guard: hasActiveFilters false ------------------------------------------

describe('useFilteredCountSync — hasActiveFilters guard', () => {
  it('does not request a count when no filter is active on the type-agnostic path', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    renderHook(() => useFilteredCountSync(baseOpts({ hasActiveFilters: false, topicTree, fc })))

    expect(fc.refetch).not.toHaveBeenCalled()
  })
})

// ---- Guard: empty topics ----------------------------------------------------

describe('useFilteredCountSync — empty topics guard', () => {
  it('does not request a count when no topics are loaded', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([])

    renderHook(() => useFilteredCountSync(baseOpts({ topicTree, fc })))

    expect(fc.refetch).not.toHaveBeenCalled()
  })
})

// ---- Happy path: all conditions met -----------------------------------------

describe('useFilteredCountSync — happy path', () => {
  it('requests a filtered count when subject, topics, and an active filter are present', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([
      { id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] },
      { id: TOPIC_ID_2, subtopics: [{ id: SUBTOPIC_ID_2 }] },
    ])

    renderHook(() => useFilteredCountSync(baseOpts({ topicTree, fc })))

    expect(fc.refetch).toHaveBeenCalledTimes(1)
    // No questionType in opts → the type-agnostic (quiz/exam) count path passes undefined.
    expect(fc.refetch).toHaveBeenCalledWith(
      ...expectedArgs({
        topicIds: [TOPIC_ID_1, TOPIC_ID_2],
        subtopicIds: [SUBTOPIC_ID_1, SUBTOPIC_ID_2],
      }),
    )
  })

  it('requests a multiple-choice-only filtered count on the Study/Discovery path', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    renderHook(() =>
      useFilteredCountSync(baseOpts({ questionType: 'multiple_choice', topicTree, fc })),
    )

    expect(fc.refetch).toHaveBeenCalledWith(...expectedArgs({ questionType: 'multiple_choice' }))
  })

  it('requests a multiple-choice-only count on the Study/Discovery path even with no active filter', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])
    const noFilters: QuestionFilterValue[] = ['all']

    renderHook(() =>
      useFilteredCountSync(
        baseOpts({
          hasActiveFilters: false,
          filters: noFilters,
          questionType: 'multiple_choice',
          topicTree,
          fc,
        }),
      ),
    )

    expect(fc.refetch).toHaveBeenCalledWith(
      ...expectedArgs({ filters: noFilters, questionType: 'multiple_choice' }),
    )
  })

  it('flattens subtopics from all topics into a single allSubtopicIds array', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([
      { id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }, { id: SUBTOPIC_ID_2 }] },
    ])

    renderHook(() =>
      useFilteredCountSync(
        baseOpts({ filters: ['flagged'], calcMode: 'only', imageMode: 'exclude', topicTree, fc }),
      ),
    )

    expect(fc.refetch).toHaveBeenCalledWith(
      ...expectedArgs({
        subtopicIds: [SUBTOPIC_ID_1, SUBTOPIC_ID_2],
        filters: ['flagged'],
        calcMode: 'only',
        imageMode: 'exclude',
      }),
    )
  })
})

// ---- Re-runs on dependency change -------------------------------------------

describe('useFilteredCountSync — re-runs on dependency change', () => {
  it('re-requests the count when imageMode changes between renders', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    const { rerender } = renderHook(
      ({ imageMode }: { imageMode: ImageMode }) =>
        useFilteredCountSync(baseOpts({ imageMode, topicTree, fc })),
      { initialProps: { imageMode: 'all' as ImageMode } },
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)
    expect(fc.refetch).toHaveBeenLastCalledWith(...expectedArgs({ imageMode: 'all' }))

    act(() => {
      rerender({ imageMode: 'only' })
    })

    expect(fc.refetch).toHaveBeenCalledTimes(2)
    expect(fc.refetch).toHaveBeenLastCalledWith(...expectedArgs({ imageMode: 'only' }))
  })

  it('re-requests the count when filters change between renders', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    const { rerender } = renderHook(
      ({ filters }: { filters: QuestionFilterValue[] }) =>
        useFilteredCountSync(baseOpts({ filters, topicTree, fc })),
      { initialProps: { filters: ['unseen'] as QuestionFilterValue[] } },
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)

    act(() => {
      rerender({ filters: ['incorrect'] })
    })

    expect(fc.refetch).toHaveBeenCalledTimes(2)
    expect(fc.refetch).toHaveBeenLastCalledWith(...expectedArgs({ filters: ['incorrect'] }))
  })

  it('does not re-request the count when a re-render leaves every dependency unchanged', () => {
    const fc = makeFc()
    // Use stable array reference for topics — same identity across renders
    const topics: MinimalTopic[] = [{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }]
    const topicTree = makeTopicTree(topics)

    // Provide a stable filters array reference to avoid triggering the effect
    const stableFilters: QuestionFilterValue[] = ['unseen']

    const { rerender } = renderHook(
      ({ calcMode }: { calcMode: CalcMode }) =>
        useFilteredCountSync(baseOpts({ filters: stableFilters, calcMode, topicTree, fc })),
      { initialProps: { calcMode: 'all' as CalcMode } },
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)

    // Re-render with the same calcMode — no dep changed
    act(() => {
      rerender({ calcMode: 'all' })
    })

    expect(fc.refetch).toHaveBeenCalledTimes(1)
  })

  it('requests an MC-only count once the Discovery question type becomes active', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])
    const noFilters: QuestionFilterValue[] = ['all']

    const { rerender } = renderHook(
      ({ questionType }: { questionType?: 'multiple_choice' }) =>
        useFilteredCountSync(
          baseOpts({ hasActiveFilters: false, filters: noFilters, topicTree, fc, questionType }),
        ),
      { initialProps: { questionType: undefined as 'multiple_choice' | undefined } },
    )

    // No active filter and no question type → the type-agnostic path stays idle.
    expect(fc.refetch).not.toHaveBeenCalled()

    act(() => {
      rerender({ questionType: 'multiple_choice' })
    })

    expect(fc.refetch).toHaveBeenCalledWith(
      ...expectedArgs({ filters: noFilters, questionType: 'multiple_choice' }),
    )
  })
})

// ---- Guard: topic tree still loading ----------------------------------------

describe('useFilteredCountSync — topic tree loading', () => {
  const PREVIOUS_TREE: MinimalTopic[] = [{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }]
  const NEW_TREE: MinimalTopic[] = [{ id: TOPIC_ID_2, subtopics: [{ id: SUBTOPIC_ID_2 }] }]

  function renderSync(
    fc: ReturnType<typeof useFilteredCount>,
    initial: { tree: MinimalTopic[]; pending: boolean; filters: QuestionFilterValue[] },
  ) {
    return renderHook(
      ({ tree, pending, filters }) =>
        useFilteredCountSync(
          baseOpts({
            hasActiveFilters: false,
            filters,
            topicTree: makeTopicTree(tree, pending),
            fc,
            questionType: 'multiple_choice',
          }),
        ),
      { initialProps: initial },
    )
  }

  it("does not request a count while the new subject's topics are still loading", () => {
    const fc = makeFc()

    renderSync(fc, { tree: PREVIOUS_TREE, pending: true, filters: ['all'] })

    expect(fc.refetch).not.toHaveBeenCalled()
  })

  it('requests one count for the loaded topics once loading ends', () => {
    const fc = makeFc()
    const { rerender } = renderSync(fc, { tree: PREVIOUS_TREE, pending: true, filters: ['all'] })

    rerender({ tree: NEW_TREE, pending: false, filters: ['all'] })

    expect(fc.refetch).toHaveBeenCalledTimes(1)
    expect(fc.refetch).toHaveBeenCalledWith(
      ...expectedArgs({
        topicIds: [TOPIC_ID_2],
        subtopicIds: [SUBTOPIC_ID_2],
        filters: ['all'],
        questionType: 'multiple_choice',
      }),
    )
  })

  it('holds a filter change made while loading and counts with it once loading ends', () => {
    const fc = makeFc()
    const { rerender } = renderSync(fc, { tree: PREVIOUS_TREE, pending: true, filters: ['all'] })

    rerender({ tree: PREVIOUS_TREE, pending: true, filters: ['unseen'] })
    expect(fc.refetch).not.toHaveBeenCalled()

    rerender({ tree: NEW_TREE, pending: false, filters: ['unseen'] })
    expect(fc.refetch).toHaveBeenCalledTimes(1)
    expect(fc.refetch).toHaveBeenCalledWith(
      ...expectedArgs({
        topicIds: [TOPIC_ID_2],
        subtopicIds: [SUBTOPIC_ID_2],
        filters: ['unseen'],
        questionType: 'multiple_choice',
      }),
    )
  })
})

// ---- Real topic tree: subject switch ----------------------------------------
// Drives the real useTopicTree (real useTransition) so the test sees the actual
// commit order of `isPending` and the loaded topics on a subject switch.

describe('useFilteredCountSync with the real topic tree', () => {
  const SUBJECT_A = '00000000-0000-4000-a000-00000000000a'
  const SUBJECT_B = '00000000-0000-4000-a000-00000000000b'

  function singleTopicTree(topicId: string, subtopicId: string): TopicWithSubtopics[] {
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

  const TREE_A = singleTopicTree('topic-a', 'sub-a')
  const TREE_B = singleTopicTree('topic-b', 'sub-b')

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
    const fc = makeFc()
    const hook = renderHook(() => {
      const [subjectId, setSubjectId] = useState('')
      const topicTree = useTopicTree()
      useFilteredCountSync(baseOpts({ subjectId, topicTree, fc, ...opts }))
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

  function refetchScopes(fc: ReturnType<typeof useFilteredCount>) {
    return vi
      .mocked(fc.refetch)
      .mock.calls.map(([subject, topicIds, subtopicIds]) => [subject, topicIds, subtopicIds])
  }

  const EXPECTED_SCOPES = [
    [SUBJECT_A, ['topic-a'], ['sub-a']],
    [SUBJECT_B, ['topic-b'], ['sub-b']],
  ]

  it('never counts the new subject against the previous subject topics in Discovery', async () => {
    const { fc, result } = renderConfig({
      hasActiveFilters: false,
      filters: ['all'],
      questionType: 'multiple_choice',
    })

    await switchSubjects(result)

    expect(refetchScopes(fc)).toEqual(EXPECTED_SCOPES)
  })

  it('never counts the new subject against the previous subject topics with an active filter', async () => {
    const { fc, result } = renderConfig({ hasActiveFilters: true, filters: ['unseen'] })

    await switchSubjects(result)

    expect(refetchScopes(fc)).toEqual(EXPECTED_SCOPES)
  })
})
