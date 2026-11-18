import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRosterSelection } from './use-roster-selection'

describe('useRosterSelection', () => {
  it('toggles one id on and off', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.toggleRoster('a'))
    expect(result.current.rosterIds).toEqual(['a'])
    act(() => result.current.toggleRoster('a'))
    expect(result.current.rosterIds).toEqual([])
  })

  it('ticks a page without duplicating ids already ticked', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.toggleRoster('a'))
    act(() => result.current.setRosterPage(['a', 'b'], true))
    expect(result.current.rosterIds).toEqual(['a', 'b'])
  })

  it('unticks only the ids of the page', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.setRosterPage(['a', 'b', 'x'], true))
    act(() => result.current.setRosterPage(['a', 'b'], false))
    expect(result.current.rosterIds).toEqual(['x'])
  })

  it('clears every tick', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.setRosterPage(['a', 'b'], true))
    act(() => result.current.clearRoster())
    expect(result.current.rosterIds).toEqual([])
  })

  it('enters all-mode with selectAll and reports it (AC 29)', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.setSelectAll(true))
    expect(result.current.selectAll).toBe(true)
  })

  it('leaves all-mode and empties ticks on any toggle (AC 29)', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.setRosterPage(['a', 'b'], true))
    act(() => result.current.setSelectAll(true))
    act(() => result.current.toggleRoster('a'))
    expect(result.current.selectAll).toBe(false)
    expect(result.current.rosterIds).toEqual([])
  })

  it('leaves all-mode on clearRoster (AC 29)', () => {
    const { result } = renderHook(() => useRosterSelection())
    act(() => result.current.setSelectAll(true))
    act(() => result.current.clearRoster())
    expect(result.current.selectAll).toBe(false)
  })
})
