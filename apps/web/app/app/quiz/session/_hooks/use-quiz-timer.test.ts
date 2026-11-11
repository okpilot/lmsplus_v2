import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetSessionTakeover, markTakenOver } from '../_utils/session-takeover'
import { useQuizTimer } from './use-quiz-timer'

beforeEach(() => {
  vi.resetAllMocks()
  _resetSessionTakeover()
})

describe('useQuizTimer', () => {
  it('opens the finish dialog once when time expires', () => {
    const setShow = vi.fn()
    const { result } = renderHook(() => useQuizTimer(undefined, 's1', setShow))
    act(() => result.current.handleTimeExpired())
    act(() => result.current.handleTimeExpired())
    expect(setShow).toHaveBeenCalledTimes(1)
    expect(setShow).toHaveBeenCalledWith(true)
    expect(result.current.timeExpired).toBe(true)
  })

  it('swallows the expiry while the session is taken over', () => {
    const setShow = vi.fn()
    const { result } = renderHook(() => useQuizTimer(undefined, 's1', setShow))
    markTakenOver('s1')
    act(() => result.current.handleTimeExpired())
    expect(setShow).not.toHaveBeenCalled()
    expect(result.current.timeExpired).toBe(false)
  })

  it('still expires when only another session is taken over', () => {
    const setShow = vi.fn()
    const { result } = renderHook(() => useQuizTimer(undefined, 's1', setShow))
    markTakenOver('s2')
    act(() => result.current.handleTimeExpired())
    expect(setShow).toHaveBeenCalledWith(true)
  })
})
