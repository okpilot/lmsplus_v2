import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Subject under test ---------------------------------------------------

import { useQuizNavigation } from './use-quiz-navigation'

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Initial index --------------------------------------------------------

describe('useQuizNavigation — initial index', () => {
  it('starts at index 0 when no initialIndex is provided', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5 }))
    expect(result.current.currentIndex).toBe(0)
  })

  it('starts at the provided initialIndex when within range', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 3 }))
    expect(result.current.currentIndex).toBe(3)
  })

  it('clamps initialIndex to the last valid index when it exceeds totalQuestions - 1', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 99 }))
    expect(result.current.currentIndex).toBe(4)
  })

  it('clamps negative initialIndex to 0', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: -3 }))
    expect(result.current.currentIndex).toBe(0)
  })

  it('clamps to 0 when totalQuestions is 0', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 0, initialIndex: 5 }))
    expect(result.current.currentIndex).toBe(0)
  })
})

// ---- navigateTo -----------------------------------------------------------

describe('useQuizNavigation — navigateTo', () => {
  it('moves to the specified index when it is within range', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5 }))
    act(() => result.current.navigateTo(3))
    expect(result.current.currentIndex).toBe(3)
  })

  it('does not navigate when the target index equals totalQuestions (out of range)', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5 }))
    act(() => result.current.navigateTo(5))
    expect(result.current.currentIndex).toBe(0)
  })

  it('does not navigate when the target index is negative', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 2 }))
    act(() => result.current.navigateTo(-1))
    expect(result.current.currentIndex).toBe(2)
  })

  it('allows navigation to index 0', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 4 }))
    act(() => result.current.navigateTo(0))
    expect(result.current.currentIndex).toBe(0)
  })

  it('allows navigation to the last valid index (totalQuestions - 1)', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5 }))
    act(() => result.current.navigateTo(4))
    expect(result.current.currentIndex).toBe(4)
  })
})

// ---- navigate (relative) --------------------------------------------------

describe('useQuizNavigation — navigate', () => {
  it('advances by +1 from the current index', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 2 }))
    act(() => result.current.navigate(1))
    expect(result.current.currentIndex).toBe(3)
  })

  it('goes back by -1 from the current index', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 3 }))
    act(() => result.current.navigate(-1))
    expect(result.current.currentIndex).toBe(2)
  })

  it('does not go below index 0', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5 }))
    act(() => result.current.navigate(-1))
    expect(result.current.currentIndex).toBe(0)
  })

  it('does not go beyond the last question', () => {
    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 5, initialIndex: 4 }))
    act(() => result.current.navigate(1))
    expect(result.current.currentIndex).toBe(4)
  })
})

// ---- answerStartTime ------------------------------------------------------

describe('useQuizNavigation — answerStartTime', () => {
  it('resets answerStartTime when navigating to a new index', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 3 }))

    const timeBefore = result.current.answerStartTime.current

    vi.advanceTimersByTime(2000)
    act(() => result.current.navigateTo(1))

    expect(result.current.answerStartTime.current).toBeGreaterThan(timeBefore)
    vi.useRealTimers()
  })

  it('does not update answerStartTime when navigation is rejected (out of range)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const { result } = renderHook(() => useQuizNavigation({ totalQuestions: 3 }))
    const timeBefore = result.current.answerStartTime.current

    vi.advanceTimersByTime(2000)
    act(() => result.current.navigateTo(99))

    expect(result.current.answerStartTime.current).toBe(timeBefore)
    vi.useRealTimers()
  })
})
