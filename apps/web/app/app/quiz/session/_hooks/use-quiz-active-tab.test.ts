import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizActiveTab } from './use-quiz-active-tab'

describe('useQuizActiveTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('starts on the question', () => {
    const { result } = renderHook(() => useQuizActiveTab(0))
    expect(result.current.activeTab).toBe('question')
  })

  it('keeps the tab the student picked while they stay on the question', () => {
    const { result, rerender } = renderHook(({ i }) => useQuizActiveTab(i), {
      initialProps: { i: 0 },
    })
    act(() => result.current.setActiveTab('explanation'))
    rerender({ i: 0 })
    expect(result.current.activeTab).toBe('explanation')
  })

  it('returns to the question when the student moves to the next one', () => {
    const { result, rerender } = renderHook(({ i }) => useQuizActiveTab(i), {
      initialProps: { i: 0 },
    })
    act(() => result.current.setActiveTab('comments'))
    expect(result.current.activeTab).toBe('comments')

    rerender({ i: 1 })
    expect(result.current.activeTab).toBe('question')
  })
})
