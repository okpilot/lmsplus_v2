import { act, renderHook } from '@testing-library/react'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockLoadTopics } = vi.hoisted(() => ({
  mockLoadTopics: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../actions/start', () => ({
  startQuizSession: vi.fn(),
}))

vi.mock('./use-quiz-start', () => ({ useQuizStart: vi.fn() }))
vi.mock('./use-topic-tree', () => ({ useTopicTree: vi.fn() }))
vi.mock('./use-filtered-count', () => ({ useFilteredCount: vi.fn() }))

// ---- Subject under test ---------------------------------------------------

import type { QuestionFilterValue } from '../types'
import { useFilteredCount } from './use-filtered-count'
import { useQuizConfig } from './use-quiz-config'
import { useQuizStart } from './use-quiz-start'
import { useTopicTree } from './use-topic-tree'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

const SUBJECTS = [{ id: SUBJECT_ID, name: 'Air Law', code: 'ALW', short: 'ALW', questionCount: 30 }]

const mockHandleStart = vi.fn()
const mockFcRefetch = vi.fn()
const mockFcReset = vi.fn()

function buildMockTopicTree(overrides?: Partial<ReturnType<typeof useTopicTree>>) {
  return {
    topics: [],
    checkedTopics: new Set<string>(),
    checkedSubtopics: new Set<string>(),
    allSelected: false,
    isPending: false,
    totalQuestions: 0,
    selectedQuestionCount: 0,
    loadTopics: mockLoadTopics,
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
    reset: vi.fn(),
    getSelectedTopicIds: vi.fn(() => [] as string[]),
    getSelectedSubtopicIds: vi.fn(() => [] as string[]),
    ...overrides,
  }
}

function buildMockFilteredCount(overrides?: Partial<ReturnType<typeof useFilteredCount>>) {
  return {
    filteredCount: null,
    filteredByTopic: null,
    filteredBySubtopic: null,
    isFilterPending: false,
    authError: false,
    refetch: mockFcRefetch,
    reset: mockFcReset,
    ...overrides,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree())
  ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount())
  ;(useQuizStart as Mock).mockReturnValue({
    loading: false,
    error: null,
    handleStart: mockHandleStart,
  })
})

// ---- Initial state --------------------------------------------------------

describe('useQuizConfig — initial state', () => {
  it('starts with no subject, discovery mode, filters=[all], count=10', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.subjectId).toBe('')
    expect(result.current.mode).toBe('discovery')
    expect(result.current.filters).toEqual(['all'])
    expect(result.current.count).toBe(10)
  })

  it('starts with no loading or error', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('exposes topicTree from useTopicTree', () => {
    const mockTree = buildMockTopicTree({ selectedQuestionCount: 42 })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.topicTree).toBe(mockTree)
  })
})

// ---- handleSubjectChange -------------------------------------------------

describe('useQuizConfig — handleSubjectChange', () => {
  it('updates subjectId to the new value', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(result.current.subjectId).toBe(SUBJECT_ID)
  })

  it('resets filters to [all] and count to 10 when subject changes', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    await act(async () => {
      result.current.setCount(25)
    })
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(result.current.filters).toEqual(['all'])
    expect(result.current.count).toBe(10)
  })

  it('calls topicTree.loadTopics with the new subjectId when non-empty', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(mockLoadTopics).toHaveBeenCalledWith(SUBJECT_ID)
  })

  it('calls topicTree.reset when subject is cleared', async () => {
    const mockTree = buildMockTopicTree()
    ;(useTopicTree as Mock).mockReturnValue(mockTree)
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(mockTree.reset).toHaveBeenCalled()
  })

  it('calls fc.reset when subject changes', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(mockFcReset).toHaveBeenCalled()
  })
})

// ---- setFilters ----------------------------------------------------------

describe('useQuizConfig — setFilters', () => {
  it('updates the filters array immediately', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    expect(result.current.filters).toEqual(['unseen'])
  })

  it('resets filtered counts when clearing all filters', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    mockFcReset.mockClear()
    await act(async () => {
      result.current.setFilters(['all'] as QuestionFilterValue[])
    })
    expect(mockFcReset).toHaveBeenCalled()
  })

  it('preserves filtered counts when applying a specific filter', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    mockFcReset.mockClear()
    await act(async () => {
      result.current.setFilters(['incorrect'] as QuestionFilterValue[])
    })
    expect(mockFcReset).not.toHaveBeenCalled()
  })

  it('fetches filtered counts for all topics when filters change', async () => {
    const mockTree = buildMockTopicTree({
      topics: [
        {
          id: 't1',
          code: '01',
          name: 'T1',
          questionCount: 5,
          subtopics: [{ id: 's1', code: '01-01', name: 'S1', questionCount: 5 }],
        },
        {
          id: 't2',
          code: '02',
          name: 'T2',
          questionCount: 5,
          subtopics: [{ id: 's2', code: '02-01', name: 'S2', questionCount: 5 }],
        },
      ],
      checkedTopics: new Set(['t1']),
      checkedSubtopics: new Set(['s1']),
      selectedQuestionCount: 5,
    })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)

    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    mockFcRefetch.mockClear()

    await act(async () => {
      result.current.setFilters(['incorrect'] as QuestionFilterValue[])
    })
    // Should pass ALL topics/subtopics, not just checked ones, plus the default
    // calcMode and imageMode. The quiz path is type-agnostic, so questionType is undefined.
    expect(mockFcRefetch).toHaveBeenCalledWith(
      SUBJECT_ID,
      ['t1', 't2'],
      ['s1', 's2'],
      ['incorrect'],
      'all',
      'all',
      undefined,
    )
    expect(mockFcRefetch).toHaveBeenCalledTimes(1)
  })

  it('does NOT re-fetch when only topic checkboxes change (counts are subject-wide)', async () => {
    const topics = [
      {
        id: 't1',
        code: '01',
        name: 'T1',
        questionCount: 5,
        subtopics: [{ id: 's1', code: '01-01', name: 'S1', questionCount: 5 }],
      },
    ]
    const mockTree = buildMockTopicTree({
      topics,
      checkedTopics: new Set(['t1']),
      checkedSubtopics: new Set(['s1']),
      selectedQuestionCount: 5,
    })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)

    const { result, rerender } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })

    // Enable filter
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    mockFcRefetch.mockClear()

    // Uncheck a topic — topics list unchanged, only checkboxes differ
    const updatedTree = buildMockTopicTree({
      topics,
      checkedTopics: new Set(),
      checkedSubtopics: new Set(),
      selectedQuestionCount: 0,
    })
    ;(useTopicTree as Mock).mockReturnValue(updatedTree)
    await act(async () => {
      rerender()
    })

    // No re-fetch needed — per-topic counts are already subject-wide
    expect(mockFcRefetch).not.toHaveBeenCalled()
  })
})

// ---- calcMode ------------------------------------------------------------

describe('useQuizConfig — calcMode', () => {
  it('starts with calcMode = all', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.calcMode).toBe('all')
  })

  it('updates calcMode when setCalcMode is called', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setCalcMode('only')
    })
    expect(result.current.calcMode).toBe('only')
  })

  it('activates the filtered-count badge path when calc-only is selected with no switch-filter', async () => {
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredCount: 8, filteredByTopic: { t1: 8 } }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    // filters is still ['all'] — only calcMode drives the badge path
    await act(async () => {
      result.current.setCalcMode('only')
    })
    expect(result.current.filteredByTopic).toEqual({ t1: 8 })
  })

  it('refetches counts with the new calcMode when calc-only is selected', async () => {
    const mockTree = buildMockTopicTree({
      topics: [
        {
          id: 't1',
          code: '01',
          name: 'T1',
          questionCount: 5,
          subtopics: [{ id: 's1', code: '01-01', name: 'S1', questionCount: 5 }],
        },
      ],
      checkedTopics: new Set(['t1']),
      checkedSubtopics: new Set(['s1']),
      selectedQuestionCount: 5,
    })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)

    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    mockFcRefetch.mockClear()

    await act(async () => {
      result.current.setCalcMode('exclude')
    })
    expect(mockFcRefetch).toHaveBeenCalledWith(
      SUBJECT_ID,
      ['t1'],
      ['s1'],
      ['all'],
      'exclude',
      'all',
      undefined,
    )
  })

  it('resets calcMode to all when the subject changes', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setCalcMode('only')
    })
    expect(result.current.calcMode).toBe('only')
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(result.current.calcMode).toBe('all')
  })
})

// ---- questionType (RT type filter, Slice 3) -------------------------------

describe('useQuizConfig — questionType', () => {
  it('starts with questionType = undefined', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.questionType).toBeUndefined()
  })

  it('updates questionType when setQuestionType is called', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setQuestionType('ordering')
    })
    expect(result.current.questionType).toBe('ordering')
  })

  it('activates the filtered-count badge path when a type is selected with no switch-filter', async () => {
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredCount: 4, filteredByTopic: { t1: 4 } }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    // filters is still ['all'] — only questionType drives the badge path
    await act(async () => {
      result.current.setQuestionType('short_answer')
    })
    expect(result.current.filteredByTopic).toEqual({ t1: 4 })
  })

  it('refetches counts with the new questionType when a type is selected', async () => {
    const mockTree = buildMockTopicTree({
      topics: [
        {
          id: 't1',
          code: '01',
          name: 'T1',
          questionCount: 5,
          subtopics: [{ id: 's1', code: '01-01', name: 'S1', questionCount: 5 }],
        },
      ],
      checkedTopics: new Set(['t1']),
      checkedSubtopics: new Set(['s1']),
      selectedQuestionCount: 5,
    })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)

    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    mockFcRefetch.mockClear()

    await act(async () => {
      result.current.setQuestionType('ordering')
    })
    expect(mockFcRefetch).toHaveBeenCalledWith(
      SUBJECT_ID,
      ['t1'],
      ['s1'],
      ['all'],
      'all',
      'all',
      'ordering',
    )
  })

  it('resets questionType to undefined when the subject changes', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setQuestionType('ordering')
    })
    expect(result.current.questionType).toBe('ordering')
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(result.current.questionType).toBeUndefined()
  })

  it('includes the selected question type in the useQuizStart payload', () => {
    renderHook(() => useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }))
    expect(useQuizStart).toHaveBeenCalledWith(expect.objectContaining({ questionType: undefined }))
  })

  it('passes the updated question type to useQuizStart after a type change', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    ;(useQuizStart as Mock).mockClear()
    await act(async () => {
      result.current.setQuestionType('ordering')
    })
    // Every re-render calls useQuizStart with the current state — after setQuestionType
    // the new value must be threaded through, not left as the initial undefined.
    expect(useQuizStart).toHaveBeenCalledWith(expect.objectContaining({ questionType: 'ordering' }))
  })
})

// ---- imageMode -----------------------------------------------------------

describe('useQuizConfig — imageMode', () => {
  it('starts with imageMode = all', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.imageMode).toBe('all')
  })

  it('updates imageMode when setImageMode is called', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setImageMode('only')
    })
    expect(result.current.imageMode).toBe('only')
  })

  it('activates the filtered-count badge path when image-only is selected with no switch-filter', async () => {
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredCount: 6, filteredByTopic: { t1: 6 } }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    // filters is still ['all'] — only imageMode drives the badge path
    await act(async () => {
      result.current.setImageMode('only')
    })
    expect(result.current.filteredByTopic).toEqual({ t1: 6 })
  })

  it('resets imageMode to all when the subject changes', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setImageMode('only')
    })
    expect(result.current.imageMode).toBe('only')
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(result.current.imageMode).toBe('all')
  })
})

// ---- setMode -------------------------------------------------------------

describe('useQuizConfig — setMode', () => {
  it('updates mode from study to exam', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setMode('exam')
    })
    expect(result.current.mode).toBe('exam')
  })

  it('can switch back from exam to study', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setMode('exam')
    })
    await act(async () => {
      result.current.setMode('study')
    })
    expect(result.current.mode).toBe('study')
  })
})

// ---- availableCount derivation -------------------------------------------

describe('useQuizConfig — availableCount', () => {
  it('uses topicTree.selectedQuestionCount when filters is [all]', () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ selectedQuestionCount: 42 }))
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.availableCount).toBe(42)
  })

  it('derives availableCount from filteredBySubtopic for checked subtopics when filter is active', async () => {
    ;(useTopicTree as Mock).mockReturnValue(
      buildMockTopicTree({
        topics: [
          {
            id: 't1',
            code: '01',
            name: 'T1',
            questionCount: 20,
            subtopics: [
              { id: 's1', code: '01-01', name: 'S1', questionCount: 12 },
              { id: 's2', code: '01-02', name: 'S2', questionCount: 8 },
            ],
          },
        ],
        checkedTopics: new Set(['t1']),
        checkedSubtopics: new Set(['s1']), // only s1 checked
        selectedQuestionCount: 12,
      }),
    )
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({
        filteredCount: 15, // total for subject (unused directly now)
        filteredByTopic: { t1: 15 },
        filteredBySubtopic: { s1: 7, s2: 8 },
      }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    // Only s1 is checked, filteredBySubtopic[s1] = 7
    expect(result.current.availableCount).toBe(7)
  })

  it('falls back to topicTree.selectedQuestionCount when filteredCount is null (fetch pending)', async () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ selectedQuestionCount: 20 }))
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ filteredCount: null }))
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setFilters(['flagged'] as QuestionFilterValue[])
    })
    // filteredCount is null while fetch is pending, falls back to selectedQuestionCount
    expect(result.current.availableCount).toBe(20)
  })
})

// ---- filteredByTopic / filteredBySubtopic gating -------------------------

describe('useQuizConfig — filteredByTopic / filteredBySubtopic gating', () => {
  it('returns filteredByTopic when a non-all filter is active', async () => {
    const byTopic = { 'topic-1': 5 }
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredCount: 5, filteredByTopic: byTopic }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    expect(result.current.filteredByTopic).toEqual(byTopic)
  })

  it('returns null for filteredByTopic when filters is [all]', () => {
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredByTopic: { 'topic-1': 5 } }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    // filters is still ['all'] by default
    expect(result.current.filteredByTopic).toBeNull()
  })

  it('returns filteredBySubtopic when a non-all filter is active', async () => {
    const bySubtopic = { 'subtopic-1': 2 }
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredCount: 2, filteredBySubtopic: bySubtopic }),
    )
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    expect(result.current.filteredBySubtopic).toEqual(bySubtopic)
  })
})

// ---- isPending — fc.isFilterPending gate ---------------------------------

describe('useQuizConfig — isPending from fc.isFilterPending', () => {
  it('is true when fc.isFilterPending is true even if topicTree.isPending is false', () => {
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ isFilterPending: true }))
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ isPending: false }))
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.isPending).toBe(true)
  })
})

// ---- handleStart delegation ----------------------------------------------

describe('useQuizConfig — handleStart', () => {
  it('invokes the start handler when called', async () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    await act(async () => {
      await result.current.handleStart()
    })
    expect(mockHandleStart).toHaveBeenCalled()
  })

  it('exposes loading and error state on its return value', () => {
    ;(useQuizStart as Mock).mockReturnValue({
      loading: true,
      error: 'Something went wrong. Please try again.',
      handleStart: mockHandleStart,
    })
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBe('Something went wrong. Please try again.')
  })
})

// ---- isPending passthrough -----------------------------------------------

describe('useQuizConfig — isPending', () => {
  it('reflects topicTree.isPending', () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ isPending: true }))
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.isPending).toBe(true)
  })
})

// ---- authError passthrough -----------------------------------------------

describe('useQuizConfig — authError', () => {
  it('is false by default when useFilteredCount reports no auth error', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.authError).toBe(false)
  })

  it('is true when useFilteredCount reports an auth error', () => {
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ authError: true }))
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.authError).toBe(true)
  })

  it('returns to false after useFilteredCount clears the auth error', () => {
    const mock = buildMockFilteredCount({ authError: true })
    ;(useFilteredCount as Mock).mockReturnValue(mock)
    const { result, rerender } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.authError).toBe(true)

    // Simulate auth error cleared (e.g. user re-authenticated)
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ authError: false }))
    rerender()
    expect(result.current.authError).toBe(false)
  })
})

// ---- initialSubjectId / initialMode seeding -------------------------------

describe('useQuizConfig — initialSubjectId / initialMode seeding', () => {
  it('seeds subjectId and mode from init params when provided', () => {
    const { result } = renderHook(() =>
      useQuizConfig({
        userId: 'test-user-id',
        subjects: SUBJECTS,
        initialSubjectId: SUBJECT_ID,
        initialMode: 'study',
      }),
    )
    expect(result.current.subjectId).toBe(SUBJECT_ID)
    expect(result.current.mode).toBe('study')
  })

  it('defaults to an empty subject and discovery mode when init params are omitted', () => {
    const { result } = renderHook(() =>
      useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }),
    )
    expect(result.current.subjectId).toBe('')
    expect(result.current.mode).toBe('discovery')
  })
})

// ---- initialTopics seeding -------------------------------------------------

describe('useQuizConfig — initialTopics seeding', () => {
  it('seeds the topic tree with the provided initial topics', () => {
    const initialTopics = [
      {
        id: 't1',
        code: '01',
        name: 'T1',
        questionCount: 5,
        subtopics: [] as { id: string; code: string; name: string; questionCount: number }[],
      },
    ]
    renderHook(() =>
      useQuizConfig({
        userId: 'test-user-id',
        subjects: SUBJECTS,
        initialSubjectId: SUBJECT_ID,
        initialMode: 'study',
        initialTopics,
      }),
    )
    expect(useTopicTree).toHaveBeenCalledWith(initialTopics)
  })

  it('starts the topic tree without seeded topics when none are provided', () => {
    renderHook(() => useQuizConfig({ userId: 'test-user-id', subjects: SUBJECTS }))
    expect(useTopicTree).toHaveBeenCalledWith(undefined)
  })
})
