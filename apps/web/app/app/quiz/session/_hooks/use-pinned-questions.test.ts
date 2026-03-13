import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePinnedQuestions } from './use-pinned-questions'

describe('usePinnedQuestions', () => {
  it('starts with an empty set', () => {
    const { result } = renderHook(() => usePinnedQuestions())
    expect(result.current.pinnedQuestions.size).toBe(0)
  })

  it('togglePin adds a question to the set', () => {
    const { result } = renderHook(() => usePinnedQuestions())
    act(() => result.current.togglePin('q1'))
    expect(result.current.pinnedQuestions.has('q1')).toBe(true)
  })

  it('togglePin removes a question that is already pinned', () => {
    const { result } = renderHook(() => usePinnedQuestions())
    act(() => result.current.togglePin('q1'))
    act(() => result.current.togglePin('q1'))
    expect(result.current.pinnedQuestions.has('q1')).toBe(false)
  })

  it('tracks multiple pinned questions independently', () => {
    const { result } = renderHook(() => usePinnedQuestions())
    act(() => result.current.togglePin('q1'))
    act(() => result.current.togglePin('q2'))
    expect(result.current.pinnedQuestions.has('q1')).toBe(true)
    expect(result.current.pinnedQuestions.has('q2')).toBe(true)
    act(() => result.current.togglePin('q1'))
    expect(result.current.pinnedQuestions.has('q1')).toBe(false)
    expect(result.current.pinnedQuestions.has('q2')).toBe(true)
  })
})
