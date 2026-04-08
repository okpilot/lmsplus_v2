'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

/**
 * Returns a stable callback that reads the live URL (`window.location.search`)
 * at call time rather than from a React `useSearchParams()` snapshot.
 *
 * This prevents stale-snapshot races when multiple sibling components update
 * URL params in quick succession before React re-renders.
 *
 * Pass `null` as a value to delete a param.
 */
export function useUpdateSearchParams() {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(window.location.search)
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      }
      router.replace(`${pathname}?${params.toString()}`)
    },
    [router, pathname],
  )
}
