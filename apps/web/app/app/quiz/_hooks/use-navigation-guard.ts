import { useEffect } from 'react'

/**
 * Attaches a `beforeunload` handler when `shouldBlock` is true,
 * warning the user before leaving the page (tab close, refresh, URL nav).
 */
export function useNavigationGuard(shouldBlock: boolean) {
  useEffect(() => {
    if (!shouldBlock) return
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldBlock])
}
