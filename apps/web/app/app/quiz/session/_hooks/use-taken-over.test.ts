import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { _resetSessionTakeover, clearTakenOver, markTakenOver } from '../_utils/session-takeover'
import { useTakenOver } from './use-taken-over'

beforeEach(() => {
  _resetSessionTakeover()
})

describe('useTakenOver', () => {
  it('is false while the session is not taken over', () => {
    const { result } = renderHook(() => useTakenOver('s1'))
    expect(result.current).toBe(false)
  })

  it('turns true when its session is marked taken over', () => {
    const { result } = renderHook(() => useTakenOver('s1'))
    act(() => markTakenOver('s1'))
    expect(result.current).toBe(true)
  })

  it('turns false again when the flag is cleared', () => {
    const { result } = renderHook(() => useTakenOver('s1'))
    act(() => markTakenOver('s1'))
    expect(result.current).toBe(true)
    act(() => clearTakenOver('s1'))
    expect(result.current).toBe(false)
  })

  it('ignores another session being taken over', () => {
    const { result } = renderHook(() => useTakenOver('s1'))
    act(() => markTakenOver('s2'))
    expect(result.current).toBe(false)
  })
})
