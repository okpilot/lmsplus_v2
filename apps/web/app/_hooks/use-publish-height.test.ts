import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePublishHeight } from './use-publish-height'

type ObserverCallback = (entries: unknown[]) => void
let observerCallback: ObserverCallback | undefined
const disconnect = vi.fn()

function stubResizeObserver() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ObserverCallback) {
        observerCallback = cb
      }
      observe() {}
      disconnect = disconnect
    },
  )
}

function mountWithHeight(height: number) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ height }) as DOMRect
  return renderHook(() => {
    const ref = usePublishHeight('--test-h')
    ref.current = el
    return ref
  })
}

const published = () => document.documentElement.style.getPropertyValue('--test-h')

afterEach(() => {
  disconnect.mockClear()
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--test-h')
  observerCallback = undefined
})

describe('usePublishHeight', () => {
  it('publishes the element height as a CSS variable on the root', () => {
    stubResizeObserver()
    mountWithHeight(54)
    expect(published()).toBe('54px')
  })

  it('updates the variable when the element resizes', () => {
    stubResizeObserver()
    const { result } = mountWithHeight(54)
    const el = result.current.current as HTMLElement
    el.getBoundingClientRect = () => ({ height: 76 }) as DOMRect
    act(() => observerCallback?.([]))
    expect(published()).toBe('76px')
  })

  it('removes the variable and stops observing on unmount', () => {
    stubResizeObserver()
    const { unmount } = mountWithHeight(54)
    unmount()
    expect(published()).toBe('')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('does nothing where ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    mountWithHeight(54)
    expect(published()).toBe('')
  })
})
