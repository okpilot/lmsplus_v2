import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

// Back/Forward reuses the restored payload and fires no router event (Next 04-glossary.md:49),
// so a window listener refreshes the hook mounted on the landed path, else records it for the next mount.
// Next's own popstate handler runs first and mounts the restored page before this listener fires.
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
 * are current: on the tab becoming visible, and on a Back/Forward restore (Next mounts the
 * restored page before the popstate listener runs, so a mounted hook refreshes itself).
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
    return () => {
      registered.delete(refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router, pathname])
}
