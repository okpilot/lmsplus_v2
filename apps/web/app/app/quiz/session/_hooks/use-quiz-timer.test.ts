import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizTimer } from './use-quiz-timer'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useQuizTimer', () => {
  it('opens the finish dialog once when time expires', () => {
    const setShow = vi.fn()
    const { result } = renderHook(() => useQuizTimer(undefined, setShow))
    act(() => result.current.handleTimeExpired())
    act(() => result.current.handleTimeExpired())
    expect(setShow).toHaveBeenCalledTimes(1)
    expect(setShow).toHaveBeenCalledWith(true)
    expect(result.current.timeExpired).toBe(true)
  })
})
