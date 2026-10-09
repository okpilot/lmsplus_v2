import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  dismissNewVersionToast,
  fetchDeploymentVersion,
  isLiveSessionPath,
  showNewVersionToast,
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

  useEffect(() => {
    let baseline: string | null = null
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    async function check() {
      if (cancelled || shownRef.current) return
      if (document.visibilityState !== 'visible' || isLiveSessionPath(pathRef.current)) return
      const latest = await fetchDeploymentVersion()
      if (cancelled || shownRef.current || !latest || latest === baseline) return
      shownRef.current = true
      showNewVersionToast()
    }
    const onVisible = () => {
      void check()
    }

    void fetchDeploymentVersion().then((version) => {
      if (cancelled || !version) return
      baseline = version
      timer = setInterval(onVisible, POLL_INTERVAL_MS)
      document.addEventListener('visibilitychange', onVisible)
    })

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
