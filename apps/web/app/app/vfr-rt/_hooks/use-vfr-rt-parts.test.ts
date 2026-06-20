import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'
import { useVfrRtParts } from './use-vfr-rt-parts'

// RT parts are flat — no subtopics in the real subject data.
const PARTS: TopicWithSubtopics[] = [
  { id: 'p1', code: 'P1_ACRONYMS', name: 'Part 1 — Acronyms', questionCount: 10, subtopics: [] },
  { id: 'p2', code: 'P2_DIALOG', name: 'Part 2 — Dialog', questionCount: 9, subtopics: [] },
  { id: 'p3', code: 'P3_MC', name: 'Part 3 — Multiple Choice', questionCount: 8, subtopics: [] },
]

describe('useVfrRtParts', () => {
  it('initialises with all parts selected and the full question count', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    expect(result.current.checkedTopics.has('p1')).toBe(true)
    expect(result.current.checkedTopics.has('p2')).toBe(true)
    expect(result.current.checkedTopics.has('p3')).toBe(true)
    expect(result.current.totalQuestions).toBe(27)
    expect(result.current.allSelected).toBe(true)
  })

  it('unchecking a topic removes it from selection and subtracts its question count', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    act(() => {
      result.current.toggleTopic('p1')
    })
    expect(result.current.checkedTopics.has('p1')).toBe(false)
    expect(result.current.totalQuestions).toBe(17)
    expect(result.current.allSelected).toBe(false)
  })

  it('re-checking a topic adds it back and restores its question count', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    act(() => {
      result.current.toggleTopic('p1')
    })
    act(() => {
      result.current.toggleTopic('p1')
    })
    expect(result.current.checkedTopics.has('p1')).toBe(true)
    expect(result.current.totalQuestions).toBe(27)
  })

  it('selectAll deselects all parts when all are currently selected', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    act(() => {
      result.current.selectAll()
    })
    expect(result.current.checkedTopics.size).toBe(0)
    expect(result.current.totalQuestions).toBe(0)
    expect(result.current.allSelected).toBe(false)
  })

  it('selectAll re-selects all parts when none are currently selected', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    act(() => {
      result.current.selectAll()
    })
    act(() => {
      result.current.selectAll()
    })
    expect(result.current.checkedTopics.has('p1')).toBe(true)
    expect(result.current.checkedTopics.has('p2')).toBe(true)
    expect(result.current.checkedTopics.has('p3')).toBe(true)
    expect(result.current.totalQuestions).toBe(27)
    expect(result.current.allSelected).toBe(true)
  })

  it('selectedTopicIds reflects the currently checked topics', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    act(() => {
      result.current.toggleTopic('p2')
    })
    expect(result.current.selectedTopicIds).toContain('p1')
    expect(result.current.selectedTopicIds).toContain('p3')
    expect(result.current.selectedTopicIds).not.toContain('p2')
    expect(result.current.selectedTopicIds).toHaveLength(2)
  })

  it('returns an empty selection and zero questions for an empty parts array', () => {
    const { result } = renderHook(() => useVfrRtParts([]))
    expect(result.current.checkedTopics.size).toBe(0)
    expect(result.current.totalQuestions).toBe(0)
    expect(result.current.allSelected).toBe(false)
    expect(result.current.selectedTopicIds).toHaveLength(0)
  })

  it('always returns an empty checkedSubtopics set because RT parts have no subtopics', () => {
    const { result } = renderHook(() => useVfrRtParts(PARTS))
    expect(result.current.checkedSubtopics.size).toBe(0)
  })
})
