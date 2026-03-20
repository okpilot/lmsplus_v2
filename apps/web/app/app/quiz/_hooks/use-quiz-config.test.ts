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
  it('starts with no subject, study mode, filters=[all], count=10', () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.subjectId).toBe('')
    expect(result.current.mode).toBe('study')
    expect(result.current.filters).toEqual(['all'])
    expect(result.current.count).toBe(10)
  })

  it('starts with no loading or error', () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('exposes topicTree from useTopicTree', () => {
    const mockTree = buildMockTopicTree({ selectedQuestionCount: 42 })
    ;(useTopicTree as Mock).mockReturnValue(mockTree)
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.topicTree).toBe(mockTree)
  })
})

// ---- handleSubjectChange -------------------------------------------------

describe('useQuizConfig — handleSubjectChange', () => {
  it('updates subjectId to the new value', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(result.current.subjectId).toBe(SUBJECT_ID)
  })

  it('resets filters to [all] and count to 10 when subject changes', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
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
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(mockLoadTopics).toHaveBeenCalledWith(SUBJECT_ID)
  })

  it('calls topicTree.reset when subject is cleared', async () => {
    const mockTree = buildMockTopicTree()
    ;(useTopicTree as Mock).mockReturnValue(mockTree)
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange('')
    })
    expect(mockTree.reset).toHaveBeenCalled()
  })

  it('calls fc.reset when subject changes', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.handleSubjectChange(SUBJECT_ID)
    })
    expect(mockFcReset).toHaveBeenCalled()
  })
})

// ---- setFilters ----------------------------------------------------------

describe('useQuizConfig — setFilters', () => {
  it('updates the filters array immediately', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    expect(result.current.filters).toEqual(['unseen'])
  })

  it('calls fc.refetch with the new filters when setFilters is called', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.setFilters(['incorrect'] as QuestionFilterValue[])
    })
    expect(mockFcRefetch).toHaveBeenCalledWith(
      '', // subjectId (initial value)
      [],
      [],
      ['incorrect'],
    )
  })
})

// ---- setMode -------------------------------------------------------------

describe('useQuizConfig — setMode', () => {
  it('updates mode from study to exam', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.setMode('exam')
    })
    expect(result.current.mode).toBe('exam')
  })

  it('can switch back from exam to study', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
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
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.availableCount).toBe(42)
  })

  it('uses filteredCount when a non-all filter is active and filteredCount is set', async () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ selectedQuestionCount: 42 }))
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ filteredCount: 7 }))
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    // filteredCount is 7 and filters is non-all, so availableCount should be 7
    expect(result.current.availableCount).toBe(7)
  })

  it('falls back to topicTree.selectedQuestionCount when filteredCount is null (fetch pending)', async () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ selectedQuestionCount: 20 }))
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ filteredCount: null }))
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
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
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      result.current.setFilters(['unseen'] as QuestionFilterValue[])
    })
    expect(result.current.filteredByTopic).toEqual(byTopic)
  })

  it('returns null for filteredByTopic when filters is [all]', () => {
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredByTopic: { 'topic-1': 5 } }),
    )
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    // filters is still ['all'] by default
    expect(result.current.filteredByTopic).toBeNull()
  })

  it('returns filteredBySubtopic when a non-all filter is active', async () => {
    const bySubtopic = { 'subtopic-1': 2 }
    ;(useFilteredCount as Mock).mockReturnValue(
      buildMockFilteredCount({ filteredCount: 2, filteredBySubtopic: bySubtopic }),
    )
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
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
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.isPending).toBe(true)
  })
})

// ---- handleStart delegation ----------------------------------------------

describe('useQuizConfig — handleStart', () => {
  it('delegates to the handleStart returned by useQuizStart', async () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    await act(async () => {
      await result.current.handleStart()
    })
    expect(mockHandleStart).toHaveBeenCalled()
  })

  it('passes loading and error state through from useQuizStart', () => {
    ;(useQuizStart as Mock).mockReturnValue({
      loading: true,
      error: 'Something went wrong. Please try again.',
      handleStart: mockHandleStart,
    })
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBe('Something went wrong. Please try again.')
  })
})

// ---- isPending passthrough -----------------------------------------------

describe('useQuizConfig — isPending', () => {
  it('reflects topicTree.isPending', () => {
    ;(useTopicTree as Mock).mockReturnValue(buildMockTopicTree({ isPending: true }))
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.isPending).toBe(true)
  })
})

// ---- authError passthrough -----------------------------------------------

describe('useQuizConfig — authError', () => {
  it('is false by default when useFilteredCount reports no auth error', () => {
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.authError).toBe(false)
  })

  it('is true when useFilteredCount reports an auth error', () => {
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ authError: true }))
    const { result } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.authError).toBe(true)
  })

  it('returns to false after useFilteredCount clears the auth error', () => {
    const mock = buildMockFilteredCount({ authError: true })
    ;(useFilteredCount as Mock).mockReturnValue(mock)
    const { result, rerender } = renderHook(() => useQuizConfig({ subjects: SUBJECTS }))
    expect(result.current.authError).toBe(true)

    // Simulate auth error cleared (e.g. user re-authenticated)
    ;(useFilteredCount as Mock).mockReturnValue(buildMockFilteredCount({ authError: false }))
    rerender()
    expect(result.current.authError).toBe(false)
  })
})
