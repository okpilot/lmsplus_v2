import { type RefObject, useEffect, useState } from 'react'
import { TAB_MIN_WIDTH } from './split-tabs'

export const DEFAULT_TAB_SLOTS = 5

/** Number of tab slots that fit the element's width; DEFAULT_TAB_SLOTS until measured. */
export function useTabSlots(ref: RefObject<HTMLElement | null>): number {
  const [slots, setSlots] = useState(DEFAULT_TAB_SLOTS)

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
