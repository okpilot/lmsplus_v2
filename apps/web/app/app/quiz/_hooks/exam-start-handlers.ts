import type { useRouter } from 'next/navigation'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import { startExamSession } from '../actions/start-exam'
import { type BlockedOffer, failStart, reportStartFailure } from './start-handler-shared'

type AppRouterInstance = ReturnType<typeof useRouter>

export type UseExamStartOpts = {
  subjectId: string
  examSubjects: ExamSubjectOption[]
}

export type ExamStartDeps = UseExamStartOpts & {
  router: AppRouterInstance
  loading: boolean
  setLoading: (v: boolean) => void
  setError: (e: string | null) => void
  setBlocked: (offer: BlockedOffer | null) => void
  inFlight: React.RefObject<boolean>
}

export function buildExamStartHandler(deps: ExamStartDeps) {
  return async function handleStart() {
    if (deps.inFlight.current || deps.loading || !deps.subjectId) return
    deps.inFlight.current = true
    deps.setLoading(true)
    deps.setError(null)
    deps.setBlocked(null)
    try {
      const result = await startExamSession({ subjectId: deps.subjectId })
      if (!result.success) return await reportStartFailure(deps, result)
      // Terminal success: the lock stays engaged while router.push unmounts the form.
      deps.router.push(`/app/quiz/session/${result.sessionId}`)
    } catch {
      failStart(deps, 'Something went wrong. Please try again.')
    }
  }
}
