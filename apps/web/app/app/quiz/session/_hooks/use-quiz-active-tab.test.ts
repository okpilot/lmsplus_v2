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

  it('returns to the question when the student moves to the next one', () => {
    const { result, rerender } = renderHook(({ i }) => useQuizActiveTab(i), {
      initialProps: { i: 0 },
    })
    act(() => result.current.setActiveTab('comments'))
    expect(result.current.activeTab).toBe('comments')

    rerender({ i: 1 })
    expect(result.current.activeTab).toBe('question')
  })

  it('leaves the tab alone while the answer is still unanswered or right', () => {
    const { result, rerender } = renderHook(({ r }) => useQuizActiveTab(0, r), {
      initialProps: { r: null as string | null },
    })
    expect(result.current.activeTab).toBe('question')

    rerender({ r: null })
    expect(result.current.activeTab).toBe('question')
  })

  it('shows the explanation once the answer comes back wrong', () => {
    const { result, rerender } = renderHook(({ r }) => useQuizActiveTab(0, r), {
      initialProps: { r: null as string | null },
    })
    rerender({ r: 'q-1' })
    expect(result.current.activeTab).toBe('explanation')
  })

  it('does not drag the student back after they navigate away from the explanation', () => {
    const { result, rerender } = renderHook(({ i, r }) => useQuizActiveTab(i, r), {
      initialProps: { i: 0, r: 'q-1' as string | null },
    })
    expect(result.current.activeTab).toBe('explanation')

    act(() => result.current.setActiveTab('question'))
    rerender({ i: 0, r: 'q-1' })
    expect(result.current.activeTab).toBe('question')
  })

  it('shows the explanation again for a different wrong answer', () => {
    const { result, rerender } = renderHook(({ i, r }) => useQuizActiveTab(i, r), {
      initialProps: { i: 0, r: 'q-1' as string | null },
    })
    expect(result.current.activeTab).toBe('explanation')

    rerender({ i: 1, r: 'q-2' })
    expect(result.current.activeTab).toBe('explanation')
  })

  it('does not reopen the explanation for a question the student already saw it for', () => {
    const { result, rerender } = renderHook(({ i, r }) => useQuizActiveTab(i, r), {
      initialProps: { i: 0, r: 'q-1' as string | null },
    })
    rerender({ i: 1, r: 'q-2' })
    // back to the first question, whose explanation was already surfaced
    rerender({ i: 0, r: 'q-1' })
    expect(result.current.activeTab).toBe('question')
  })
})
