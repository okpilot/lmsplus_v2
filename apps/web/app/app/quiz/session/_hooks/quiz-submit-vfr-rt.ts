import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { SessionQuestion } from '@/app/app/_types/session'
import { buildVfrRtExamPayload } from '@/app/app/vfr-rt-exam/_utils/build-vfr-rt-exam-payload'
import { submitVfrRtExam } from '@/app/app/vfr-rt-exam/actions/submit'
import { clearDeploymentPin } from '../../actions/clear-deployment-pin'
import { submitEmptyExamSession } from '../../actions/submit-empty-exam'
import type { DraftAnswer } from '../../types'
import { clearActiveSessionIfCurrent } from '../_utils/quiz-session-storage'
import { reportUrl } from './exam-report-paths'

const GENERIC_ERROR = 'Something went wrong. Please try again.'

async function submitPayload(
  sessionId: string,
  payload: ReturnType<typeof buildVfrRtExamPayload>,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (payload.length === 0) return await submitEmptyExamSession({ sessionId })
    return await submitVfrRtExam({ sessionId, answers: payload })
  } catch (err) {
    console.error('[handleSubmitVfrRtExamSession] submit threw:', err)
    return { success: false, error: GENERIC_ERROR }
  }
}

/** Submits a VFR RT exam. A failed submit keeps the local session and never discards
 * the server session, so the student can retry. */
export async function handleSubmitVfrRtExamSession(opts: {
  userId: string
  sessionId: string
  answers: Map<string, DraftAnswer>
  questions: readonly SessionQuestion[]
  router: AppRouterInstance
  setSubmitting: (v: boolean) => void
  setError: (e: string | null) => void
  onSuccess: () => void
}) {
  opts.setSubmitting(true)
  opts.setError(null)
  const payload = buildVfrRtExamPayload(opts.answers, opts.questions)
  const result = await submitPayload(opts.sessionId, payload)
  if (!result.success) {
    console.error('[handleSubmitVfrRtExamSession] submit failed:', result.error)
    opts.setError(GENERIC_ERROR)
    opts.setSubmitting(false)
    return
  }
  opts.onSuccess()
  clearActiveSessionIfCurrent(opts.userId, opts.sessionId)
  // Await so the Server Action revalidation cannot cancel the soft navigation (#568).
  await clearDeploymentPin().catch(() => {})
  opts.router.push(reportUrl('vfr_rt_exam', opts.sessionId))
}
