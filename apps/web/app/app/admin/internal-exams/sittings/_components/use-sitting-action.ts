import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import type { ResultBannerData } from '../_utils/copy'
import type { SittingActionResult } from '../actions/sitting-action-result'

type Options = { errorAsBanner?: boolean }

/**
 * Runs a sitting action in a transition. The previous banner is cleared first; `onOk` returns the new
 * banner (or null) and the page refreshes. A failure stays in the confirm dialog (`error`) or, with
 * `errorAsBanner`, becomes a danger banner.
 */
export function useSittingAction() {
  const router = useRouter()
  const { setBanner } = useSittingUi()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function fail(message: string, o?: Options) {
    if (o?.errorAsBanner) setBanner({ tone: 'danger', title: message })
    else setError(message)
  }

  function run<T extends object>(
    call: () => Promise<SittingActionResult<T>>,
    onOk: (data: T) => ResultBannerData | null,
    o?: Options,
  ) {
    setError(null)
    setBanner(null)
    startTransition(async () => {
      try {
        const result = await call()
        if (!result.success) {
          fail(result.error, o)
          return
        }
        setBanner(onOk(result))
        router.refresh()
      } catch {
        fail('Service error. Please try again.', o)
      }
    })
  }
  return { pending, error, run, clearError: () => setError(null) }
}
