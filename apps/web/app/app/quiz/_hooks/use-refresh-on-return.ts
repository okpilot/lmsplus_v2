import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

// Back/Forward reuses the restored payload and fires no router event (next/dist/docs/01-app/04-glossary.md:49,
// 03-api-reference/04-functions/use-router.md:64),
// so a window listener refreshes the hook mounted on the landed path, else records it for the next mount.
// Next's popstate handler usually mounts the restored page before this listener; if not, landedPath refreshes the later mount.
let landedPath: string | null = null
const registered = new Map<() => void, string>()
let listening = false

function onPopstate() {
  const path = window.location.pathname
  if (registered.size === 0) {
    landedPath = path
    return
  }
  for (const [refresh, hookPath] of registered) {
    if (hookPath === path) refresh()
  }
}

/**
 * Re-renders the server tree when the student returns to the page, so per-student counts
 * are current: on the tab becoming visible, and on a Back/Forward restore (a mounted hook
 * refreshes itself; a later mount consumes `landedPath`).
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
      window.addEventListener('popstate', onPopstate)
    }
    if (landedPath === pathname) {
      landedPath = null
      refresh()
    }
    registered.set(refresh, pathname)
    function onVisibility() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    // bfcache restore fires pageshow, not popstate: https://web.dev/articles/bfcache
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) refresh()
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      registered.delete(refresh)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [router, pathname])
}
