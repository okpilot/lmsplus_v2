import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalcMode, ImageMode, QuestionFilterValue } from '../types'
import type { useFilteredCount } from './use-filtered-count'
import { useFilteredCountSync } from './use-filtered-count-sync'
import type { useTopicTree } from './use-topic-tree'

// ---- Fixtures ---------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'
const TOPIC_ID_1 = '00000000-0000-4000-b000-000000000001'
const TOPIC_ID_2 = '00000000-0000-4000-b000-000000000002'
const SUBTOPIC_ID_1 = '00000000-0000-4000-c000-000000000001'
const SUBTOPIC_ID_2 = '00000000-0000-4000-c000-000000000002'

type MinimalTopic = { id: string; subtopics: { id: string }[] }

// The hook reads only `topicTree.topics` (each topic's id + its subtopics' ids), so
// the fixture models just that and casts to the full hook return type — the other
// TopicTree fields are never touched on this path.
function makeTopicTree(topics: MinimalTopic[] = []): ReturnType<typeof useTopicTree> {
  return {
    topics,
    checkedTopics: new Set<string>(),
    checkedSubtopics: new Set<string>(),
    allSelected: false,
    isPending: false,
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

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Guard: subjectId empty -------------------------------------------------

describe('useFilteredCountSync — subjectId guard', () => {
  it('does not call fc.refetch when subjectId is empty', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    renderHook(() =>
      useFilteredCountSync({
        subjectId: '',
        hasActiveFilters: true,
        filters: DEFAULT_FILTERS,
        calcMode: DEFAULT_CALC_MODE,
        imageMode: DEFAULT_IMAGE_MODE,
        topicTree,
        fc,
      }),
    )

    expect(fc.refetch).not.toHaveBeenCalled()
  })
})

// ---- Guard: hasActiveFilters false ------------------------------------------

describe('useFilteredCountSync — hasActiveFilters guard', () => {
  it('does not call fc.refetch when hasActiveFilters is false', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    renderHook(() =>
      useFilteredCountSync({
        subjectId: SUBJECT_ID,
        hasActiveFilters: false,
        filters: DEFAULT_FILTERS,
        calcMode: DEFAULT_CALC_MODE,
        imageMode: DEFAULT_IMAGE_MODE,
        topicTree,
        fc,
      }),
    )

    expect(fc.refetch).not.toHaveBeenCalled()
  })
})

// ---- Guard: empty topics ----------------------------------------------------

describe('useFilteredCountSync — empty topics guard', () => {
  it('does not call fc.refetch when topicTree.topics is empty', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([])

    renderHook(() =>
      useFilteredCountSync({
        subjectId: SUBJECT_ID,
        hasActiveFilters: true,
        filters: DEFAULT_FILTERS,
        calcMode: DEFAULT_CALC_MODE,
        imageMode: DEFAULT_IMAGE_MODE,
        topicTree,
        fc,
      }),
    )

    expect(fc.refetch).not.toHaveBeenCalled()
  })
})

// ---- Happy path: all conditions met -----------------------------------------

describe('useFilteredCountSync — happy path', () => {
  it('calls fc.refetch with all six args when subjectId, hasActiveFilters, and topics are present', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([
      { id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] },
      { id: TOPIC_ID_2, subtopics: [{ id: SUBTOPIC_ID_2 }] },
    ])

    renderHook(() =>
      useFilteredCountSync({
        subjectId: SUBJECT_ID,
        hasActiveFilters: true,
        filters: DEFAULT_FILTERS,
        calcMode: DEFAULT_CALC_MODE,
        imageMode: DEFAULT_IMAGE_MODE,
        topicTree,
        fc,
      }),
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)
    expect(fc.refetch).toHaveBeenCalledWith(
      SUBJECT_ID,
      [TOPIC_ID_1, TOPIC_ID_2],
      [SUBTOPIC_ID_1, SUBTOPIC_ID_2],
      DEFAULT_FILTERS,
      DEFAULT_CALC_MODE,
      DEFAULT_IMAGE_MODE,
    )
  })

  it('flattens subtopics from all topics into a single allSubtopicIds array', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([
      { id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }, { id: SUBTOPIC_ID_2 }] },
    ])

    renderHook(() =>
      useFilteredCountSync({
        subjectId: SUBJECT_ID,
        hasActiveFilters: true,
        filters: ['flagged'],
        calcMode: 'only',
        imageMode: 'exclude',
        topicTree,
        fc,
      }),
    )

    expect(fc.refetch).toHaveBeenCalledWith(
      SUBJECT_ID,
      [TOPIC_ID_1],
      [SUBTOPIC_ID_1, SUBTOPIC_ID_2],
      ['flagged'],
      'only',
      'exclude',
    )
  })
})

// ---- Re-runs on dependency change -------------------------------------------

describe('useFilteredCountSync — re-runs on dependency change', () => {
  it('re-calls fc.refetch when imageMode changes between renders', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    const { rerender } = renderHook(
      ({ imageMode }: { imageMode: ImageMode }) =>
        useFilteredCountSync({
          subjectId: SUBJECT_ID,
          hasActiveFilters: true,
          filters: DEFAULT_FILTERS,
          calcMode: DEFAULT_CALC_MODE,
          imageMode,
          topicTree,
          fc,
        }),
      { initialProps: { imageMode: 'all' as ImageMode } },
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)
    expect(fc.refetch).toHaveBeenLastCalledWith(
      SUBJECT_ID,
      [TOPIC_ID_1],
      [SUBTOPIC_ID_1],
      DEFAULT_FILTERS,
      DEFAULT_CALC_MODE,
      'all',
    )

    act(() => {
      rerender({ imageMode: 'only' })
    })

    expect(fc.refetch).toHaveBeenCalledTimes(2)
    expect(fc.refetch).toHaveBeenLastCalledWith(
      SUBJECT_ID,
      [TOPIC_ID_1],
      [SUBTOPIC_ID_1],
      DEFAULT_FILTERS,
      DEFAULT_CALC_MODE,
      'only',
    )
  })

  it('re-calls fc.refetch when filters change between renders', () => {
    const fc = makeFc()
    const topicTree = makeTopicTree([{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }])

    const { rerender } = renderHook(
      ({ filters }: { filters: QuestionFilterValue[] }) =>
        useFilteredCountSync({
          subjectId: SUBJECT_ID,
          hasActiveFilters: true,
          filters,
          calcMode: DEFAULT_CALC_MODE,
          imageMode: DEFAULT_IMAGE_MODE,
          topicTree,
          fc,
        }),
      { initialProps: { filters: ['unseen'] as QuestionFilterValue[] } },
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)

    act(() => {
      rerender({ filters: ['incorrect'] })
    })

    expect(fc.refetch).toHaveBeenCalledTimes(2)
    expect(fc.refetch).toHaveBeenLastCalledWith(
      SUBJECT_ID,
      [TOPIC_ID_1],
      [SUBTOPIC_ID_1],
      ['incorrect'],
      DEFAULT_CALC_MODE,
      DEFAULT_IMAGE_MODE,
    )
  })

  it('does not re-call fc.refetch when unrelated props change but deps stay the same', () => {
    const fc = makeFc()
    // Use stable array reference for topics — same identity across renders
    const topics: MinimalTopic[] = [{ id: TOPIC_ID_1, subtopics: [{ id: SUBTOPIC_ID_1 }] }]
    const topicTree = makeTopicTree(topics)

    // Provide a stable filters array reference to avoid triggering the effect
    const stableFilters: QuestionFilterValue[] = ['unseen']

    const { rerender } = renderHook(
      ({ calcMode }: { calcMode: CalcMode }) =>
        useFilteredCountSync({
          subjectId: SUBJECT_ID,
          hasActiveFilters: true,
          filters: stableFilters,
          calcMode,
          imageMode: DEFAULT_IMAGE_MODE,
          topicTree,
          fc,
        }),
      { initialProps: { calcMode: 'all' as CalcMode } },
    )

    expect(fc.refetch).toHaveBeenCalledTimes(1)

    // Re-render with the same calcMode — no dep changed
    act(() => {
      rerender({ calcMode: 'all' })
    })

    expect(fc.refetch).toHaveBeenCalledTimes(1)
  })
})
