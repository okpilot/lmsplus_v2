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

  it('reads the observer entry border-box height without measuring layout', () => {
    stubResizeObserver()
    const { result } = mountWithHeight(54)
    const el = result.current.current as HTMLElement
    el.getBoundingClientRect = () => {
      throw new Error('layout read')
    }
    act(() => observerCallback?.([{ borderBoxSize: [{ blockSize: 91 }] }]))
    expect(published()).toBe('91px')
  })

  it('falls back to measuring the element when the entry has no border-box size', () => {
    stubResizeObserver()
    const { result } = mountWithHeight(54)
    const el = result.current.current as HTMLElement
    el.getBoundingClientRect = () => ({ height: 63 }) as DOMRect
    act(() => observerCallback?.([{}]))
    expect(published()).toBe('63px')
  })

  it('removes the variable and stops observing on unmount', () => {
    stubResizeObserver()
    const { unmount } = mountWithHeight(54)
    unmount()
    expect(published()).toBe('')
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('publishes the initial height where ResizeObserver is unavailable and removes it on unmount', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { unmount } = mountWithHeight(54)
    expect(published()).toBe('54px')
    unmount()
    expect(published()).toBe('')
  })
})
