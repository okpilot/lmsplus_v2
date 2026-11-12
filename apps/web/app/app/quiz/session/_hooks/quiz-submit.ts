import type { useRouter } from 'next/navigation'
import type { ActionResult } from '@/lib/action-result'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { reportUrl } from '@/lib/constants/report-paths'
import { discardQuiz } from '../../actions/discard'
import { finishQuizSession } from '../../actions/finish'
import { isTakeoverError } from '../../actions/progress-error-messages'
import { saveQuizForLater } from '../../actions/saved-quiz'
import type { DraftAnswer } from '../../types'
import { withTakeoverCheck } from '../_utils/claim-quiz-device'
import { getQuizDeviceId } from '../_utils/quiz-device-id'
import { clearActiveSessionIfCurrent } from '../_utils/quiz-session-storage'
import { isCurrentRunner, markRunnerExiting, runnerToken } from '../_utils/runner-exit'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetError = (e: string | null) => void
type SetSubmitting = (v: boolean) => void

/** Ends the session on the server (it grades the answers already saved) and clears local state. */
export async function submitQuizSession(sessionId: string, userId: string) {
  try {
    const result = await withTakeoverCheck(sessionId, () =>
      finishQuizSession({ sessionId, deviceId: getQuizDeviceId() }),
    )
    if (!result.success) return { success: false as const, error: result.error }
    clearActiveSessionIfCurrent(userId, sessionId)
    return { success: true as const }
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export function discardQuizSession(
  sessionId: string,
  router: AppRouterInstance,
  userId: string,
): Promise<ActionResult> {
  return discardWithToken({ sessionId, router, userId, token: runnerToken() })
}

async function discardWithToken({
  sessionId,
  router,
  userId,
  token,
}: {
  sessionId: string
  router: AppRouterInstance
  userId: string
  token: number
}): Promise<ActionResult> {
  clearActiveSessionIfCurrent(userId, sessionId) // Always clear — respect discard intent even if Server Action fails
  try {
    const result = await discardQuiz({ sessionId })
    if (!result.success) return result
    if (!isCurrentRunner(token)) return { success: true }
    markRunnerExiting()
    router.replace('/app/quiz')
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
  token?: number
}) {
  if (opts.answers.size === 0 && !opts.isExam) {
    opts.setError('No answers to submit.')
    // Release the caller's re-entry lock: this path never called setSubmitting(true),
    // so without this the synchronous useRef gate in useQuizSubmit.handleSubmit would
    // stay stuck and the student could never retry Submit in the same session.
    opts.setSubmitting(false)
    return
  }
  const token = opts.token ?? runnerToken()
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await submitQuizSession(opts.sessionId, opts.userId)
  if (r.success) {
    if (!isCurrentRunner(token)) return
    opts.onSuccess()
    markRunnerExiting()
    opts.router.replace(reportUrl(opts.examMode, opts.sessionId))
  } else {
    // A takeover refusal: the takeover dialog explains it; no stale copy once the flag clears.
    opts.setError(isTakeoverError(r.error) ? null : r.error)
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
  token?: number
}) {
  const token = opts.token ?? runnerToken()
  opts.setSubmitting(true)
  opts.setError(null)
  try {
    const r = await withTakeoverCheck(opts.sessionId, () =>
      saveQuizForLater({ sessionId: opts.sessionId, deviceId: getQuizDeviceId() }),
    )
    if (r.success) {
      clearActiveSessionIfCurrent(opts.userId, opts.sessionId)
      if (!isCurrentRunner(token)) return
      markRunnerExiting()
      opts.router.replace('/app/quiz')
      return
    }
    opts.setError(isTakeoverError(r.error) ? null : r.error)
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
  token?: number
}) {
  const token = opts.token ?? runnerToken()
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await discardWithToken({
    sessionId: opts.sessionId,
    router: opts.router,
    userId: opts.userId,
    token,
  })
  if (!r.success) {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
  // On success, router.replace navigates away — no further state update needed
}
