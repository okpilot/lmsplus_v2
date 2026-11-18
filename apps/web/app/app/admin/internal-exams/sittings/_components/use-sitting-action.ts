import { useState, useTransition } from 'react'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import type { ResultBannerData } from '../_utils/copy'
import type { SittingActionResult } from '../actions/sitting-action-result'

/**
 * Runs a sitting action in a transition. The previous banner is cleared first; `onOk` returns the new
 * banner (or null); the action revalidates the page. A failure stays in the confirm dialog (`error`).
 */
export function useSittingAction() {
  const { setBanner } = useSittingUi()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run<T extends object>(
    call: () => Promise<SittingActionResult<T>>,
    onOk: (data: T) => ResultBannerData | null,
  ) {
    setError(null)
    setBanner(null)
    startTransition(async () => {
      try {
        const result = await call()
        if (!result.success) {
          setError(result.error)
          return
        }
        setBanner(onOk(result))
      } catch {
        setError('Service error. Please try again.')
      }
    })
  }
  return { pending, error, run, clearError: () => setError(null) }
}
