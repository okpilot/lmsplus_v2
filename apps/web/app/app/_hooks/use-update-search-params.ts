'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Returns a stable callback that reads the live URL (`window.location.search`)
 * at call time rather than from a React `useSearchParams()` snapshot.
 *
 * This prevents stale-snapshot races when multiple sibling components update
 * URL params in quick succession before React re-renders. App Router updates the URL only
 * when a navigation commits, so the new URL is written to history first (current state kept,
 * which carries Next's tree state) and every later update builds on it.
 *
 * Pass `null` as a value to delete a param.
 */
export function useUpdateSearchParams() {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    (updates: Record<string, string | null>) => {
      // Safe: callback only runs in browser event handlers, never during SSR
      const params = new URLSearchParams(window.location.search)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      window.history.replaceState(window.history.state, '', url)
      router.replace(url)
    },
    [router, pathname],
  )
}
