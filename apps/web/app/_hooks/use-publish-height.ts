import { useEffect, useRef } from 'react'

/** Publishes the element's rendered height as a CSS variable on the root, removed on unmount. */
export function usePublishHeight(name: string) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const publish = () => root.style.setProperty(name, `${el.getBoundingClientRect().height}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(name)
    }
  }, [name])

  return ref
}
