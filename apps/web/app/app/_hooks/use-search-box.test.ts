import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchBox } from './use-search-box'

const update = vi.fn()
const keys = { key: 'q', pageKey: 'attemptsPage' }

beforeEach(() => {
  vi.useFakeTimers()
  update.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('useSearchBox', () => {
  it('starts from the URL value', () => {
    const { result } = renderHook(() => useSearchBox('abc', update, keys))
    expect(result.current.text).toBe('abc')
  })

  it('debounces typing into the custom key and clears the custom page key', () => {
    const { result } = renderHook(() => useSearchBox(undefined, update, keys))
    act(() => result.current.onType(' ann '))
    expect(update).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(update).toHaveBeenCalledWith({ q: 'ann', attemptsPage: null })
  })

  it('writes null for blank text', () => {
    const { result } = renderHook(() => useSearchBox('x', update, keys))
    act(() => result.current.onType('  '))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(update).toHaveBeenCalledWith({ q: null, attemptsPage: null })
  })

  it('re-syncs the box when the URL value changes and nothing is pending', () => {
    const { result, rerender } = renderHook(({ v }) => useSearchBox(v, update, keys), {
      initialProps: { v: 'a' as string | undefined },
    })
    rerender({ v: 'b' })
    expect(result.current.text).toBe('b')
  })

  it('keeps pending typing when the URL value changes', () => {
    const { result, rerender } = renderHook(({ v }) => useSearchBox(v, update, keys), {
      initialProps: { v: 'a' as string | undefined },
    })
    act(() => result.current.onType('typing'))
    rerender({ v: 'zzz' })
    expect(result.current.text).toBe('typing')
  })

  it('takePending flushes pending typing once and cancels the debounce', () => {
    const { result } = renderHook(() => useSearchBox(undefined, update, keys))
    expect(result.current.takePending()).toEqual({})
    act(() => result.current.onType('ann'))
    let pending: Record<string, string | null> = {}
    act(() => {
      pending = result.current.takePending()
    })
    expect(pending).toEqual({ q: 'ann' })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('reset clears the text and cancels pending typing', () => {
    const { result } = renderHook(() => useSearchBox('a', update, keys))
    act(() => result.current.onType('ann'))
    act(() => result.current.reset())
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current.text).toBe('')
    expect(update).not.toHaveBeenCalled()
  })

  it('supports the students keys', () => {
    const { result } = renderHook(() =>
      useSearchBox(undefined, update, { key: 'search', pageKey: 'page' }),
    )
    act(() => result.current.onType('bob'))
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(update).toHaveBeenCalledWith({ search: 'bob', page: null })
  })
})
