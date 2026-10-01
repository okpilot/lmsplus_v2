import { type RefObject, useEffect, useState } from 'react'
import { TAB_MIN_WIDTH } from './split-tabs'

/** Number of tab slots that fit the element's width; unbounded until measured. */
export function useTabSlots(ref: RefObject<HTMLElement | null>): number {
  const [slots, setSlots] = useState(Number.POSITIVE_INFINITY)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSlots(Math.floor(entry.contentRect.width / TAB_MIN_WIDTH))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return slots
}
