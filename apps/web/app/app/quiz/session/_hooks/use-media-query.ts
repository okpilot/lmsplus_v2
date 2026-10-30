import { useSyncExternalStore } from 'react'

const noop = () => {}

/** Subscribes to a CSS media query. Server snapshot is `false` (hydration-safe); `false` too where matchMedia is absent. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return noop
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
