import { usePathname } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { isLiveSessionPath, startVersionPolling } from '@/lib/deployment-version'

export const POLL_INTERVAL_MS = 60_000

type Stage = 'none' | 'dialog' | 'banner'

export function useNewVersionCheck() {
  const pathname = usePathname()
  const detectedRef = useRef(false)
  const [stage, setStage] = useState<Stage>('none')

  const isPathSuppressed = useEffectEvent(() => isLiveSessionPath(pathname))

  useEffect(
    () =>
      startVersionPolling({
        isSuppressed: () => detectedRef.current || isPathSuppressed(),
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
