import { act, fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useStudyRunner } from './use-study-runner'

// ---- Paging forward and back ---------------------------------------------

describe('useStudyRunner — paging forward and back', () => {
  it('starts at index 0', () => {
    const { result } = renderHook(() => useStudyRunner(3))
    expect(result.current.currentIndex).toBe(0)
  })

  it('advances to the next position when goNext is called', () => {
    const { result } = renderHook(() => useStudyRunner(3))
    act(() => result.current.goNext())
    expect(result.current.currentIndex).toBe(1)
  })

  it('returns to the previous position when goPrev is called after advancing', () => {
    const { result } = renderHook(() => useStudyRunner(3))
    act(() => result.current.goNext())
    act(() => result.current.goPrev())
    expect(result.current.currentIndex).toBe(0)
  })

  it('stays at index 0 when goPrev is called at the start', () => {
    const { result } = renderHook(() => useStudyRunner(3))
    act(() => result.current.goPrev())
    expect(result.current.currentIndex).toBe(0)
  })

  it('stays at the last position when goNext is called at the end', () => {
    const { result } = renderHook(() => useStudyRunner(2))
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.currentIndex).toBe(1)
  })
})

// ---- Clamp when the set shrinks ------------------------------------------

describe('useStudyRunner — clamp when the set shrinks', () => {
  it('clamps the index to the new last position when the set shrinks while mid-session', () => {
    const { result, rerender } = renderHook(({ length }) => useStudyRunner(length), {
      initialProps: { length: 3 },
    })
    act(() => result.current.goNext())
    act(() => result.current.goNext())
    expect(result.current.currentIndex).toBe(2)

    rerender({ length: 2 })
    expect(result.current.currentIndex).toBe(1)
  })

  it('resets the index to 0 when the set becomes empty', () => {
    const { result, rerender } = renderHook(({ length }) => useStudyRunner(length), {
      initialProps: { length: 2 },
    })
    act(() => result.current.goNext())
    expect(result.current.currentIndex).toBe(1)

    rerender({ length: 0 })
    expect(result.current.currentIndex).toBe(0)
  })
})

// ---- goNext no-op on empty list ------------------------------------------

describe('useStudyRunner — goNext no-op when the list is empty', () => {
  it('keeps the index at 0 when goNext is called on an empty list', () => {
    const { result } = renderHook(() => useStudyRunner(0))
    act(() => result.current.goNext())
    expect(result.current.currentIndex).toBe(0)
  })
})

// ---- ArrowRight does not set a negative index on an empty list -----------

describe('useStudyRunner — ArrowRight does not set a negative index on an empty list', () => {
  it('keeps the index at 0 when ArrowRight is pressed after the list empties', () => {
    const { result, rerender } = renderHook(({ length }) => useStudyRunner(length), {
      initialProps: { length: 1 },
    })
    rerender({ length: 0 })
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(result.current.currentIndex).toBe(0)
  })
})
