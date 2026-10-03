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

describe('usePinnedQuestions — returned set', () => {
  it('returns the resulting set and keeps the ref current before the next render', () => {
    const { result } = renderHook(() => usePinnedQuestions())
    let next = new Set<string>()
    act(() => {
      next = result.current.togglePin('q1')
    })
    expect([...next]).toEqual(['q1'])
    expect([...result.current.pinnedRef.current]).toEqual(['q1'])
  })

  it('reflects two toggles in one tick', () => {
    const { result } = renderHook(() => usePinnedQuestions())
    let next = new Set<string>()
    act(() => {
      result.current.togglePin('q1')
      next = result.current.togglePin('q2')
    })
    expect([...next].sort()).toEqual(['q1', 'q2'])
  })
})
