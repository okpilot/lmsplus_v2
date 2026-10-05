import type { useRouter } from 'next/navigation'
import type { ActionResult } from '@/lib/action-result'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { batchSubmitQuiz } from '../../actions/batch-submit'
import { clearDeploymentPin } from '../../actions/clear-deployment-pin'
import { discardQuiz } from '../../actions/discard'
import { saveQuizForLater } from '../../actions/saved-quiz'
import { submitEmptyExamSession } from '../../actions/submit-empty-exam'
import type { DraftAnswer } from '../../types'
import { getQuizDeviceId } from '../_utils/quiz-device-id'
import { clearActiveSession } from '../_utils/quiz-session-storage'
import { reportUrl } from './exam-report-paths'
import { fanOutAnswer } from './quiz-submit-fanout'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetError = (e: string | null) => void
type SetSubmitting = (v: boolean) => void

export async function submitQuizSession(
  sessionId: string,
  answers: Map<string, DraftAnswer>,
  userId: string,
) {
  const answerArray = Array.from(answers.entries()).flatMap(([qId, a]) => fanOutAnswer(qId, a))
  try {
    const result = await batchSubmitQuiz({ sessionId, answers: answerArray })
    if (!result.success) return { success: false as const, error: result.error }
    clearActiveSession(userId)
    // #909: a Server Action response triggers an App Router revalidation that cancels a
    // pending soft navigation. Await cleanup so router.push (in handleSubmitSession) runs
    // with nothing in flight.
    await clearDeploymentPin().catch(() => {})
    return result
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function discardQuizSession(
  sessionId: string,
  router: AppRouterInstance,
  userId: string,
): Promise<ActionResult> {
  clearActiveSession(userId) // Always clear — respect discard intent even if Server Action fails
  // Await before the later router.push so the Server Action revalidation can't cancel the
  // soft navigation (#909 — same race the submit paths fix).
  await clearDeploymentPin().catch(() => {})
  try {
    const result = await discardQuiz({ sessionId })
    if (!result.success) return result
    router.push('/app/quiz')
    return { success: true }
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function handleSubmitSession(opts: {
  userId: string
  sessionId: string
  answers: Map<string, DraftAnswer>
  router: AppRouterInstance
  setSubmitting: SetSubmitting
  setError: SetError
  onSuccess: () => void
  isExam?: boolean
  examMode?: DbQuizMode
}) {
  if (opts.answers.size === 0 && !opts.isExam) {
    opts.setError('No answers to submit.')
    // Release the caller's re-entry lock: this path never called setSubmitting(true),
    // so without this the synchronous useRef gate in useQuizSubmit.handleSubmit would
    // stay stuck and the student could never retry Submit in the same session.
    opts.setSubmitting(false)
    return
  }
  if (opts.answers.size === 0 && opts.isExam) {
    // Exam finished with no answers (timer-expiry or manual finish). Complete
    // the session server-side so the student lands on the report page (0% / FAIL)
    // instead of being silently discarded. submitEmptyExamSession catches its
    // own errors, but RSC stream / network failures can still reject — fall back
    // to the same cleanup as a result.success===false response.
    opts.setSubmitting(true)
    let result: Awaited<ReturnType<typeof submitEmptyExamSession>>
    try {
      result = await submitEmptyExamSession({ sessionId: opts.sessionId })
    } catch (err) {
      console.error('[handleSubmitSession] submitEmptyExamSession threw:', err)
      result = { success: false, error: 'Something went wrong. Please try again.' }
    }
    if (result.success) {
      opts.onSuccess()
      clearActiveSession(opts.userId)
      // clearDeploymentPin is a Server Action — its response triggers an App Router
      // revalidation. If it is still in flight when router.push runs, that revalidation
      // cancels the pending soft navigation, stranding the student on the session page
      // with "Submitting…" (#568). Await it so push is the last statement with nothing
      // in flight — matching the batch-submit path (submitQuizSession).
      await clearDeploymentPin().catch(() => {})
      opts.router.push(reportUrl(opts.examMode, opts.sessionId))
    } else {
      console.error('[handleSubmitSession] submitEmptyExamSession failed:', result.error)
      clearActiveSession(opts.userId)
      await clearDeploymentPin().catch(() => {})
      await discardQuiz({ sessionId: opts.sessionId }).catch((err) =>
        console.error('[handleSubmitSession] discardQuiz fallback failed:', err),
      )
      opts.setError(result.error)
      opts.router.push('/app/quiz')
      opts.setSubmitting(false)
    }
    return
  }
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await submitQuizSession(opts.sessionId, opts.answers, opts.userId)
  if (r.success) {
    opts.onSuccess()
    opts.router.push(reportUrl(opts.examMode, opts.sessionId))
  } else {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
}

/** Parks the quiz on its own session id, then returns to the quiz list. A failure keeps the quiz open. */
export async function handleSaveSession(opts: {
  userId: string
  sessionId: string
  router: AppRouterInstance
  setSubmitting: SetSubmitting
  setError: SetError
}) {
  opts.setSubmitting(true)
  opts.setError(null)
  try {
    const r = await saveQuizForLater({
      sessionId: opts.sessionId,
      deviceId: getQuizDeviceId(),
    })
    if (r.success) {
      clearActiveSession(opts.userId)
      // Await so the Server Action revalidation can't cancel the soft navigation (#909).
      await clearDeploymentPin().catch(() => {})
      opts.router.push('/app/quiz')
      return
    }
    opts.setError(r.error)
  } catch {
    opts.setError('Something went wrong. Please try again.')
  }
  opts.setSubmitting(false)
}

export async function handleDiscardSession(opts: {
  userId: string
  sessionId: string
  router: AppRouterInstance
  setSubmitting: SetSubmitting
  setError: SetError
}) {
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await discardQuizSession(opts.sessionId, opts.router, opts.userId)
  if (!r.success) {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
  // On success, router.push navigates away — no further state update needed
}
