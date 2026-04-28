import type { useRouter } from 'next/navigation'
import { batchSubmitQuiz } from '../../actions/batch-submit'
import { clearDeploymentPin } from '../../actions/clear-deployment-pin'
import { discardQuiz } from '../../actions/discard'
import { saveDraft } from '../../actions/draft'
import { deleteDraft } from '../../actions/draft-delete'
import { submitEmptyExamSession } from '../../actions/submit-empty-exam'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { clearActiveSession } from '../_utils/quiz-session-storage'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetError = (e: string | null) => void
type SetSubmitting = (v: boolean) => void

export async function submitQuizSession(
  sessionId: string,
  answers: Map<string, DraftAnswer>,
  userId: string,
  draftId?: string,
) {
  const answerArray = Array.from(answers.entries()).map(([qId, a]) => ({
    questionId: qId,
    selectedOptionId: a.selectedOptionId,
    responseTimeMs: a.responseTimeMs,
  }))
  try {
    const result = await batchSubmitQuiz({ sessionId, answers: answerArray })
    if (!result.success) return { success: false as const, error: result.error }
    clearActiveSession(userId)
    clearDeploymentPin().catch(() => {})
    if (draftId) {
      deleteDraft({ draftId }).catch((e) =>
        console.error('[submitQuizSession] Draft cleanup failed:', e),
      )
    }
    return result
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function discardQuizSession(
  sessionId: string,
  router: AppRouterInstance,
  userId: string,
  draftId?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  clearActiveSession(userId) // Always clear — respect discard intent even if Server Action fails
  clearDeploymentPin().catch(() => {})
  try {
    const result = await discardQuiz({ sessionId, draftId })
    if (!result.success) return result
    router.push('/app/quiz')
    return { success: true }
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function saveQuizDraft(opts: {
  userId: string
  sessionId: string
  questionIds: string[]
  answers: Map<string, DraftAnswer>
  feedback?: Map<string, AnswerFeedback>
  currentIndex: number
  router: AppRouterInstance
  draftId?: string
  subjectName?: string
  subjectCode?: string
}) {
  const answerObj = Object.fromEntries(opts.answers)
  const feedbackObj = opts.feedback ? Object.fromEntries(opts.feedback) : undefined
  try {
    const result = await saveDraft({
      draftId: opts.draftId,
      sessionId: opts.sessionId,
      questionIds: opts.questionIds,
      answers: answerObj,
      feedback: feedbackObj,
      currentIndex: opts.currentIndex,
      subjectName: opts.subjectName,
      subjectCode: opts.subjectCode,
    })
    if (result.success) {
      clearActiveSession(opts.userId)
      clearDeploymentPin().catch(() => {})
      opts.router.push('/app/quiz')
      return { success: true as const }
    }
    return { success: false as const, error: result.error }
  } catch {
    return { success: false as const, error: 'Something went wrong. Please try again.' }
  }
}

export async function handleSubmitSession(opts: {
  userId: string
  sessionId: string
  answers: Map<string, DraftAnswer>
  draftId: string | undefined
  router: AppRouterInstance
  setSubmitting: SetSubmitting
  setError: SetError
  onSuccess: () => void
  isExam?: boolean
}) {
  if (opts.answers.size === 0 && !opts.isExam) {
    opts.setError('No answers to submit.')
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
      opts.router.push(`/app/quiz/report?session=${opts.sessionId}`)
      clearDeploymentPin().catch(() => {})
    } else {
      console.error('[handleSubmitSession] submitEmptyExamSession failed:', result.error)
      clearActiveSession(opts.userId)
      clearDeploymentPin().catch(() => {})
      await discardQuiz({ sessionId: opts.sessionId, draftId: opts.draftId }).catch((err) =>
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
  const r = await submitQuizSession(opts.sessionId, opts.answers, opts.userId, opts.draftId)
  if (r.success) {
    opts.onSuccess()
    opts.router.push(`/app/quiz/report?session=${opts.sessionId}`)
  } else {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
}

export async function handleSaveSession(opts: {
  userId: string
  sessionId: string
  questions: Array<{ id: string }>
  answers: Map<string, DraftAnswer>
  feedback?: Map<string, AnswerFeedback>
  currentIndex: number
  router: AppRouterInstance
  draftId: string | undefined
  subjectName: string | undefined
  subjectCode: string | undefined
  setSubmitting: SetSubmitting
  setError: SetError
}) {
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await saveQuizDraft({
    userId: opts.userId,
    sessionId: opts.sessionId,
    questionIds: opts.questions.map((q) => q.id),
    answers: opts.answers,
    feedback: opts.feedback,
    currentIndex: opts.currentIndex,
    router: opts.router,
    draftId: opts.draftId,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })
  if (!r.success) {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
}

export async function handleDiscardSession(opts: {
  userId: string
  sessionId: string
  router: AppRouterInstance
  draftId: string | undefined
  setSubmitting: SetSubmitting
  setError: SetError
}) {
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await discardQuizSession(opts.sessionId, opts.router, opts.userId, opts.draftId)
  if (!r.success) {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
  // On success, router.push navigates away — no further state update needed
}
