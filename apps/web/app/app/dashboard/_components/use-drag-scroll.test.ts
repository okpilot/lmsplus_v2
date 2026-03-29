import { renderHook } from '@testing-library/react'
import { createRef, type RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDragScroll } from './use-drag-scroll'

// PointerEventInit doesn't include pageX — define it manually for jsdom
function pointerEvent(type: string, init: PointerEventInit & { pageX?: number } = {}) {
  const { pageX, ...rest } = init
  const evt = new PointerEvent(type, rest)
  if (pageX !== undefined) Object.defineProperty(evt, 'pageX', { value: pageX })
  return evt
}

function makeScrollDiv(overrides: Partial<HTMLDivElement> = {}): HTMLDivElement {
  const el = document.createElement('div')
  // jsdom doesn't implement setPointerCapture
  el.setPointerCapture = vi.fn()
  el.releasePointerCapture = vi.fn()
  Object.defineProperties(el, {
    offsetLeft: { value: 0, configurable: true },
    scrollLeft: { value: 0, writable: true, configurable: true },
    scrollWidth: { value: 500, configurable: true },
    clientWidth: { value: 200, configurable: true },
  })
  Object.assign(el, overrides)
  document.body.appendChild(el)
  return el
}

describe('useDragScroll', () => {
  let el: HTMLDivElement

  beforeEach(() => {
    vi.resetAllMocks()
    el = makeScrollDiv()
  })

  afterEach(() => {
    document.body.removeChild(el)
  })

  it('attaches pointer and wheel listeners to the element', () => {
    const addSpy = vi.spyOn(el, 'addEventListener')
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))
    const events = addSpy.mock.calls.map((c) => c[0])
    expect(events).toContain('pointerdown')
    expect(events).toContain('pointermove')
    expect(events).toContain('pointerup')
    expect(events).toContain('wheel')
  })

  it('removes all listeners on unmount', () => {
    const removeSpy = vi.spyOn(el, 'removeEventListener')
    const ref = { current: el } as RefObject<HTMLDivElement>
    const { unmount } = renderHook(() => useDragScroll(ref))
    unmount()
    const events = removeSpy.mock.calls.map((c) => c[0])
    expect(events).toContain('pointerdown')
    expect(events).toContain('pointermove')
    expect(events).toContain('pointerup')
    expect(events).toContain('pointerleave')
    expect(events).toContain('pointercancel')
    expect(events).toContain('wheel')
  })

  it('does nothing when ref.current is null', () => {
    const ref = createRef<HTMLDivElement>()
    // ref.current is null by default — hook must not throw
    expect(() => renderHook(() => useDragScroll(ref))).not.toThrow()
  })

  it('scrolls left when dragging right-to-left', () => {
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    // Simulate: pointerdown at x=100, then pointermove to x=80 → scrolls right by 20
    el.dispatchEvent(pointerEvent('pointerdown', { bubbles: true, pageX: 100, pointerId: 1 }))
    el.dispatchEvent(pointerEvent('pointermove', { bubbles: true, pageX: 80, pointerId: 1 }))

    // scrollLeft = 0 - (80 - 0 - 100) = 0 - (-20) = 20
    expect(el.scrollLeft).toBe(20)
  })

  it('does not scroll when pointer is not down', () => {
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    // pointermove without a preceding pointerdown
    el.dispatchEvent(pointerEvent('pointermove', { bubbles: true, pageX: 80, pointerId: 1 }))

    expect(el.scrollLeft).toBe(0)
  })

  it('stops scrolling after pointerup', () => {
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    el.dispatchEvent(pointerEvent('pointerdown', { bubbles: true, pageX: 100, pointerId: 1 }))
    el.dispatchEvent(pointerEvent('pointerup', { bubbles: true, pointerId: 1 }))
    // Move after up — should not scroll
    el.dispatchEvent(pointerEvent('pointermove', { bubbles: true, pageX: 50, pointerId: 1 }))

    expect(el.scrollLeft).toBe(0)
  })

  it('translates vertical wheel delta into horizontal scroll', () => {
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50, cancelable: true }))

    expect(el.scrollLeft).toBe(50)
  })

  it('clamps wheel scroll to zero at the left boundary', () => {
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    // Scrolling up (negative deltaY) from scrollLeft 0 — must clamp to 0
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100, cancelable: true }))

    expect(el.scrollLeft).toBe(0)
  })

  it('clamps wheel scroll to maxScrollLeft at the right boundary', () => {
    // scrollWidth=500, clientWidth=200 → max=300
    el.scrollLeft = 290
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100, cancelable: true }))

    expect(el.scrollLeft).toBe(300)
  })

  it('does not scroll via wheel when content fits without overflow', () => {
    // scrollWidth === clientWidth → no overflow
    Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true })
    const ref = { current: el } as RefObject<HTMLDivElement>
    renderHook(() => useDragScroll(ref))

    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 50, cancelable: true }))

    expect(el.scrollLeft).toBe(0)
  })
})
