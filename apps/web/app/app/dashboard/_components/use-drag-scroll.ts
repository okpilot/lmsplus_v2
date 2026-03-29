import { type RefObject, useEffect } from 'react'

/** Adds drag-to-scroll and wheel-to-scroll on a horizontally scrollable container. */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref is a stable RefObject — effect intentionally runs once
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let isDown = false
    let startX = 0
    let scrollLeft = 0

    const onDown = (e: PointerEvent) => {
      isDown = true
      startX = e.pageX - el.offsetLeft
      scrollLeft = el.scrollLeft
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!isDown) return
      e.preventDefault()
      el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX)
    }
    const onUp = () => {
      isDown = false
    }

    // Translate vertical wheel into horizontal scroll
    const onWheel = (e: WheelEvent) => {
      const maxScrollLeft = el.scrollWidth - el.clientWidth
      if (maxScrollLeft <= 0) return

      const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, el.scrollLeft + e.deltaY))
      if (nextScrollLeft === el.scrollLeft) return

      e.preventDefault()
      el.scrollLeft = nextScrollLeft
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref])
}
