import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  dismissNewVersionToast,
  isLiveSessionPath,
  showNewVersionToast,
  startVersionPolling,
} from '@/lib/deployment-version'

export const POLL_INTERVAL_MS = 60_000

export function useNewVersionCheck() {
  const pathname = usePathname()
  const pathRef = useRef(pathname)
  const shownRef = useRef(false)

  useEffect(() => {
    pathRef.current = pathname
    if (!isLiveSessionPath(pathname)) return
    dismissNewVersionToast()
    shownRef.current = false
  }, [pathname])

  useEffect(
    () =>
      startVersionPolling({
        isSuppressed: () => shownRef.current || isLiveSessionPath(pathRef.current),
        onNewVersion: () => {
          shownRef.current = true
          showNewVersionToast()
        },
        intervalMs: POLL_INTERVAL_MS,
      }),
    [],
  )
}
