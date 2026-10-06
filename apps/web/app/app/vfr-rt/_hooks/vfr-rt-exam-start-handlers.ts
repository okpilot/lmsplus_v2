import type { useRouter } from 'next/navigation'
import {
  type BlockedOffer,
  failStart,
  reportStartFailure,
} from '@/app/app/quiz/_hooks/start-handler-shared'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { startVfrRtExam } from '../../vfr-rt-exam/actions/start'

type AppRouterInstance = ReturnType<typeof useRouter>

export type UseVfrRtExamStartOpts = {
  subjectId: string
  subjects: SubjectOption[]
}

export type VfrRtExamStartDeps = UseVfrRtExamStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setBlocked: (offer: BlockedOffer | null) => void
  inFlight: React.RefObject<boolean>
}

export function buildVfrRtExamStartHandler(deps: VfrRtExamStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    deps.setBlocked(null)
    try {
      const result = await startVfrRtExam({ subjectId: deps.subjectId })
      if (!result.success) return await reportStartFailure(deps, result)
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push(`/app/quiz/session/${result.sessionId}`)
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
