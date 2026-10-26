import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

// Back/Forward reuses the restored payload and fires no router event (Next 04-glossary.md:49),
// so a window listener records where a popstate landed until the next mount consumes it.
let landedPath: string | null = null
let mounted = 0
let listening = false

function recordPopstate() {
  // Only while no hook is mounted: a popstate with the page mounted is a client navigation.
  if (mounted === 0) landedPath = window.location.pathname
}

/**
 * Re-renders the server tree when the student returns to the page, so per-student counts
 * are current: on the tab becoming visible, and on mounting after a Back/Forward restore.
 * A refresh already in flight absorbs further triggers.
 */
export function useRefreshOnReturn() {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const inFlight = useRef(false)

  useEffect(() => {
    if (!isPending) inFlight.current = false
  }, [isPending])

  useEffect(() => {
    function refresh() {
      if (inFlight.current) return
      inFlight.current = true
      startTransition(() => router.refresh())
    }
    if (!listening) {
      listening = true
      window.addEventListener('popstate', recordPopstate)
    }
    if (landedPath === pathname) {
      landedPath = null
      refresh()
    }
    mounted++
    function onVisibility() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted--
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router, pathname])
}
