import type { useRouter } from 'next/navigation'
import { batchSubmitQuiz } from '../../actions/batch-submit'
import { discardQuiz } from '../../actions/discard'
import { saveDraft } from '../../actions/draft'
import { deleteDraft } from '../../actions/draft-delete'
import type { DraftAnswer } from '../../types'
import { clearActiveSession } from '../_utils/quiz-session-storage'

type AppRouterInstance = ReturnType<typeof useRouter>

type SetError = (e: string | null) => void
type SetSubmitting = (v: boolean) => void

export async function submitQuizSession(
  sessionId: string,
  answers: Map<string, DraftAnswer>,
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
    clearActiveSession()
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
  draftId?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  clearActiveSession() // Always clear — respect discard intent even if Server Action fails
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
  sessionId: string
  questionIds: string[]
  answers: Map<string, DraftAnswer>
  currentIndex: number
  router: AppRouterInstance
  draftId?: string
  subjectName?: string
  subjectCode?: string
}) {
  const answerObj = Object.fromEntries(opts.answers)
  const result = await saveDraft({
    draftId: opts.draftId,
    sessionId: opts.sessionId,
    questionIds: opts.questionIds,
    answers: answerObj,
    currentIndex: opts.currentIndex,
    subjectName: opts.subjectName,
    subjectCode: opts.subjectCode,
  })
  if (result.success) {
    clearActiveSession()
    opts.router.push('/app/quiz')
    return { success: true as const }
  }
  return { success: false as const, error: result.error }
}

export async function handleSubmitSession(opts: {
  sessionId: string
  answers: Map<string, DraftAnswer>
  draftId: string | undefined
  router: AppRouterInstance
  setSubmitting: SetSubmitting
  setError: SetError
  onSuccess: () => void
}) {
  if (opts.answers.size === 0) {
    opts.setError('No answers to submit.')
    return
  }
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await submitQuizSession(opts.sessionId, opts.answers, opts.draftId)
  if (r.success) {
    opts.onSuccess()
    opts.router.push(`/app/quiz/report?session=${opts.sessionId}`)
  } else {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
}

export async function handleSaveSession(opts: {
  sessionId: string
  questions: Array<{ id: string }>
  answers: Map<string, DraftAnswer>
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
    sessionId: opts.sessionId,
    questionIds: opts.questions.map((q) => q.id),
    answers: opts.answers,
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
  sessionId: string
  router: AppRouterInstance
  draftId: string | undefined
  setSubmitting: SetSubmitting
  setError: SetError
}) {
  opts.setSubmitting(true)
  opts.setError(null)
  const r = await discardQuizSession(opts.sessionId, opts.router, opts.draftId)
  if (!r.success) {
    opts.setError(r.error)
    opts.setSubmitting(false)
  }
  // On success, router.push navigates away — no further state update needed
}
