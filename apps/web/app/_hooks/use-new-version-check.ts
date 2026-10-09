import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isLiveSessionPath, startVersionPolling } from '@/lib/deployment-version'

export const POLL_INTERVAL_MS = 60_000

type Stage = 'none' | 'dialog' | 'banner'

export function useNewVersionCheck() {
  const pathname = usePathname()
  const pathRef = useRef(pathname)
  const detectedRef = useRef(false)
  const [stage, setStage] = useState<Stage>('none')

  useEffect(() => {
    pathRef.current = pathname
  }, [pathname])

  useEffect(
    () =>
      startVersionPolling({
        isSuppressed: () => detectedRef.current || isLiveSessionPath(pathRef.current),
        onNewVersion: () => {
          detectedRef.current = true
          setStage('dialog')
        },
        intervalMs: POLL_INTERVAL_MS,
      }),
    [],
  )

  return {
    prompt: isLiveSessionPath(pathname) ? ('none' as const) : stage,
    reload: () => window.location.reload(),
    later: () => setStage('banner'),
  }
}
