import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGridWindow } from './use-grid-window'

// jsdom has no layout engine: offsetWidth is 0, so measure() is skipped and
// perRow stays at the default 9 → twoRows = 18 for every assertion below.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const base = { minSquare: 36, gap: 6, currentIndex: 0, enabled: true }

describe('useGridWindow', () => {
  it('does not collapse when the question count fits in two rows', () => {
    const { result } = renderHook(() => useGridWindow({ ...base, totalQuestions: 5 }))
    expect(result.current.needsCollapse).toBe(false)
    expect(result.current.collapsed).toBe(false)
  })

  it('collapses when the question count exceeds two rows', () => {
    const { result } = renderHook(() => useGridWindow({ ...base, totalQuestions: 40 }))
    expect(result.current.needsCollapse).toBe(true)
    expect(result.current.collapsed).toBe(true)
    expect(result.current.windowStart).toBe(0)
    expect(result.current.windowEnd).toBe(18)
  })

  it('never collapses when windowing is disabled (a filter is active)', () => {
    const { result } = renderHook(() =>
      useGridWindow({ ...base, totalQuestions: 40, enabled: false }),
    )
    expect(result.current.needsCollapse).toBe(false)
    expect(result.current.collapsed).toBe(false)
  })

  it('expands to the full range when toggled', () => {
    const { result } = renderHook(() => useGridWindow({ ...base, totalQuestions: 40 }))
    act(() => result.current.setExpanded(true))
    expect(result.current.collapsed).toBe(false)
    expect(result.current.windowEnd).toBe(40)
  })

  it('keeps the current question in view by scrolling the window while collapsed', () => {
    const { result } = renderHook(() =>
      useGridWindow({ ...base, totalQuestions: 40, currentIndex: 25 }),
    )
    // perRow 9 → row of index 25 is floor(25/9)=2; window starts one row above.
    expect(result.current.windowStart).toBe(9)
    expect(result.current.windowEnd).toBe(27)
    expect(result.current.windowStart).toBeLessThanOrEqual(25)
    expect(result.current.windowEnd).toBeGreaterThan(25)
  })
})
