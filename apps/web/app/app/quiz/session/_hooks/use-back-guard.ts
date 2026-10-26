import { useEffect, useEffectEvent } from 'react'
import { armHistoryGuard } from '@/lib/history-guard'

/** While `active`, every Back/Forward is cancelled and reported to `onAttempt` (the latest one). */
export function useBackGuard(active: boolean, onAttempt: () => void) {
  const attempt = useEffectEvent(onAttempt)

  // Subscriptions only — no data fetching
  useEffect(() => {
    if (!active) return
    return armHistoryGuard(() => attempt())
  }, [active])
}
