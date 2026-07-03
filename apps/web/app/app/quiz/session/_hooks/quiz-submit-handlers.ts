import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import {
  examReportUrl,
  handleDiscardSession,
  handleSaveSession,
  handleSubmitSession,
} from './quiz-submit'

/** Which finish-dialog action is currently in flight, or null when idle. */
export type QuizPendingAction = 'submit' | 'save' | 'discard' | null

/** If the post-submit soft navigation hasn't unmounted this component within this window,
 * hard-navigate to the report so the student is never stranded on "Submitting…". (#909) */
export const NAV_FALLBACK_MS = 4000

/** Deps shared by every handler builder — identity + the submitting/error/re-entry state. */
type BaseDeps = {
  userId: string
  sessionId: string
  router: AppRouterInstance
  draftId?: string
  setPendingAction: (v: QuizPendingAction) => void
  setError: (e: string | null) => void
  submitted: React.RefObject<boolean>
  inFlight: React.RefObject<boolean>
}

/** Builds the per-action `{ router, setSubmitting, setError }` bundle handleSubmitSession /
 * handleSaveSession / handleDiscardSession expect, wiring the shared pendingAction + inFlight
 * re-entry lock. Exported standalone so its setSubmitting mapping is directly unit-testable. */
export function buildSharedFor(deps: BaseDeps) {
  return (action: Exclude<QuizPendingAction, null>) => ({
    router: deps.router,
    setSubmitting: (v: boolean) => {
      deps.setPendingAction(v ? action : null)
      // Reset the submit re-entry lock when the submit finishes without having
      // succeeded (on success, onSuccess sets submitted.current = true first, so
      // inFlight stays locked — terminal; on error, submitted is still false —
      // retryable). Scoped to 'submit' so a save/discard completion can never
      // reset an in-flight submit's lock (inFlight is only set by handleSubmit).
      if (!v && action === 'submit' && !deps.submitted.current) deps.inFlight.current = false
    },
    setError: deps.setError,
  })
}

export function buildHandleSubmit(
  deps: BaseDeps & {
    answersRef: React.RefObject<Map<string, DraftAnswer>>
    pendingQuestionIdRef: React.RefObject<Set<string>>
    navFallbackTimer: React.RefObject<ReturnType<typeof setTimeout> | null>
    setShowFinishDialog: (v: boolean) => void
    isExam?: boolean
    examMode?: DbQuizMode
  },
) {
  const sharedFor = buildSharedFor(deps)
  return async function handleSubmit() {
    if (deps.inFlight.current || deps.submitted.current) return
    deps.inFlight.current = true
    const pending = deps.pendingQuestionIdRef.current
    const safeAnswers =
      pending.size > 0
        ? new Map([...deps.answersRef.current].filter(([qId]) => !pending.has(qId)))
        : deps.answersRef.current
    await handleSubmitSession({
      userId: deps.userId,
      sessionId: deps.sessionId,
      answers: safeAnswers,
      draftId: deps.draftId,
      isExam: deps.isExam,
      examMode: deps.examMode,
      onSuccess: () => {
        deps.submitted.current = true
        deps.setShowFinishDialog(false)
      },
      ...sharedFor('submit'),
    }).finally(() => {
      // If submit rejected/threw before any setSubmitting(false), release the re-entry lock
      // so the student can retry. On success onSuccess set submitted.current = true first, so
      // the lock intentionally stays engaged here (terminal — navigating to the report).
      if (!deps.submitted.current) deps.inFlight.current = false
    })
    if (deps.submitted.current) {
      if (deps.navFallbackTimer.current) clearTimeout(deps.navFallbackTimer.current)
      deps.navFallbackTimer.current = setTimeout(() => {
        // Soft nav didn't unmount us → it was cancelled (#909). Hard-navigate to the
        // same destination; safe even if it fires after a slow-but-successful nav.
        window.location.assign(examReportUrl(deps.examMode, deps.sessionId))
      }, NAV_FALLBACK_MS)
    }
  }
}

export function buildHandleSave(
  deps: BaseDeps & {
    questions: SessionQuestion[]
    answersRef: React.RefObject<Map<string, DraftAnswer>>
    feedbackRef: React.RefObject<Map<string, AnswerFeedback>>
    currentIndexRef: React.RefObject<number>
    pendingQuestionIdRef: React.RefObject<Set<string>>
    subjectName?: string
    subjectCode?: string
  },
) {
  const sharedFor = buildSharedFor(deps)
  return function handleSave() {
    const pending = deps.pendingQuestionIdRef.current
    const safeAnswers =
      pending.size > 0
        ? new Map([...deps.answersRef.current].filter(([qId]) => !pending.has(qId)))
        : deps.answersRef.current
    return handleSaveSession({
      userId: deps.userId,
      sessionId: deps.sessionId,
      questions: deps.questions,
      answers: safeAnswers,
      feedback: deps.feedbackRef.current,
      currentIndex: deps.currentIndexRef.current,
      draftId: deps.draftId,
      subjectName: deps.subjectName,
      subjectCode: deps.subjectCode,
      ...sharedFor('save'),
    })
  }
}

export function buildHandleDiscard(deps: BaseDeps) {
  const sharedFor = buildSharedFor(deps)
  return function handleDiscard() {
    return handleDiscardSession({
      userId: deps.userId,
      sessionId: deps.sessionId,
      draftId: deps.draftId,
      ...sharedFor('discard'),
    })
  }
}
