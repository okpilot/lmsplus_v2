import { useEffect, useRef } from 'react'

/** Publishes the element's rendered height as a CSS variable on the root, removed on unmount. */
export function usePublishHeight(name: string) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const set = (height: number) => root.style.setProperty(name, `${height}px`)
    set(el.getBoundingClientRect().height)
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty(name)
    const observer = new ResizeObserver((entries) => {
      set(entries[0]?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(name)
    }
  }, [name])

  return ref
}
