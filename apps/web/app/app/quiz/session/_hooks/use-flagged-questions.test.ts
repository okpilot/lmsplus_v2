import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFlaggedQuestions } from './use-flagged-questions'

describe('useFlaggedQuestions', () => {
  it('starts with an empty set', () => {
    const { result } = renderHook(() => useFlaggedQuestions())
    expect(result.current.flaggedQuestions.size).toBe(0)
  })

  it('toggleFlag adds a question to the set', () => {
    const { result } = renderHook(() => useFlaggedQuestions())
    act(() => result.current.toggleFlag('q1'))
    expect(result.current.flaggedQuestions.has('q1')).toBe(true)
  })

  it('toggleFlag removes a question that is already flagged', () => {
    const { result } = renderHook(() => useFlaggedQuestions())
    act(() => result.current.toggleFlag('q1'))
    act(() => result.current.toggleFlag('q1'))
    expect(result.current.flaggedQuestions.has('q1')).toBe(false)
  })

  it('tracks multiple flagged questions independently', () => {
    const { result } = renderHook(() => useFlaggedQuestions())
    act(() => result.current.toggleFlag('q1'))
    act(() => result.current.toggleFlag('q2'))
    expect(result.current.flaggedQuestions.has('q1')).toBe(true)
    expect(result.current.flaggedQuestions.has('q2')).toBe(true)
    act(() => result.current.toggleFlag('q1'))
    expect(result.current.flaggedQuestions.has('q1')).toBe(false)
    expect(result.current.flaggedQuestions.has('q2')).toBe(true)
  })
})
