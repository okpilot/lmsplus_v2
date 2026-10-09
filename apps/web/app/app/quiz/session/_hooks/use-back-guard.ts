import { useEffect, useRef } from 'react'
import { armHistoryGuard } from '@/lib/history-guard'

/** While `active`, every Back/Forward is cancelled and reported to `onAttempt` (the latest one). */
export function useBackGuard(active: boolean, onAttempt: () => void) {
  const attemptRef = useRef(onAttempt)
  attemptRef.current = onAttempt

  // Subscriptions only — no data fetching
  useEffect(() => {
    if (!active) return
    return armHistoryGuard(() => attemptRef.current())
  }, [active])
}
