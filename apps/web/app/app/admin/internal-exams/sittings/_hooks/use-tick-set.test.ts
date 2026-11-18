import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTickSet } from './use-tick-set'

describe('useTickSet', () => {
  it('starts empty, or with the initial ids', () => {
    expect(renderHook(() => useTickSet()).result.current.ids).toEqual([])
    expect(renderHook(() => useTickSet(['a', 'b'])).result.current.ids).toEqual(['a', 'b'])
  })

  it('toggles an id on and off, keeping tick order', () => {
    const { result } = renderHook(() => useTickSet())
    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b'))
    expect(result.current.ids).toEqual(['a', 'b'])
    act(() => result.current.toggle('a'))
    expect(result.current.ids).toEqual(['b'])
  })

  it('ticks many ids without duplicates and unticks only the given ones', () => {
    const { result } = renderHook(() => useTickSet(['a']))
    act(() => result.current.setMany(['a', 'b', 'c'], true))
    expect(result.current.ids).toEqual(['a', 'b', 'c'])
    act(() => result.current.setMany(['a', 'c'], false))
    expect(result.current.ids).toEqual(['b'])
  })

  it('clears every tick', () => {
    const { result } = renderHook(() => useTickSet(['a', 'b']))
    act(() => result.current.clear())
    expect(result.current.ids).toEqual([])
  })

  it('keeps stable callbacks across renders', () => {
    const { result } = renderHook(() => useTickSet())
    const first = result.current
    act(() => result.current.toggle('a'))
    expect(result.current.toggle).toBe(first.toggle)
    expect(result.current.setMany).toBe(first.setMany)
    expect(result.current.clear).toBe(first.clear)
  })
})
