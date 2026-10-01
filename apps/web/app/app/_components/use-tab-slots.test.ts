import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTabSlots } from './use-tab-slots'

type Callback = (entries: { contentRect: { width: number } }[]) => void

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useTabSlots', () => {
  it('is unbounded when ResizeObserver is unavailable', () => {
    const el = document.createElement('nav')
    const { result } = renderHook(() => useTabSlots({ current: el }))
    expect(result.current).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns how many 64px slots fit the measured width', () => {
    let callback: Callback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: Callback) {
          callback = cb
        }
        observe() {}
        disconnect = disconnect
      },
    )
    const el = document.createElement('nav')
    const ref = { current: el }
    const { result, unmount } = renderHook(() => useTabSlots(ref))

    act(() => callback([{ contentRect: { width: 330 } }]))
    expect(result.current).toBe(5)

    act(() => callback([{ contentRect: { width: 63 } }]))
    expect(result.current).toBe(0)

    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
