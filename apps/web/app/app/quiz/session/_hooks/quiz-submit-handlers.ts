import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { whenQueueIdle } from '../_utils/with-reconnect'
import {
  examReportUrl,
  handleDiscardSession,
  handleSaveSession,
  handleSubmitSession,
} from './quiz-submit'
import { handleSubmitVfrRtExamSession } from './quiz-submit-vfr-rt'

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

type SubmitDeps = Parameters<typeof buildHandleSubmit>[0]

/** Runs the mode-specific submit: vfr_rt_exam has its own per-type submit, everything else
 * goes through handleSubmitSession. */
function dispatchSubmission({
  deps,
  sharedFor,
  answers,
  onSuccess,
}: {
  deps: SubmitDeps
  sharedFor: ReturnType<typeof buildSharedFor>
  answers: Map<string, DraftAnswer>
  onSuccess: () => void
}) {
  const common = { userId: deps.userId, sessionId: deps.sessionId, answers, onSuccess }
  if (deps.examMode === 'vfr_rt_exam') {
    return handleSubmitVfrRtExamSession({
      ...common,
      questions: deps.questions,
      ...sharedFor('submit'),
    })
  }
  return handleSubmitSession({
    ...common,
    draftId: deps.draftId,
    isExam: deps.isExam,
    examMode: deps.examMode,
    ...sharedFor('submit'),
  })
}

/** Shows the action as in flight, then waits for every queued save to settle, so the action
 * cannot reach Next.js's action queue ahead of them. */
async function waitForQueuedSaves(shared: ReturnType<ReturnType<typeof buildSharedFor>>) {
  shared.setSubmitting(true)
  shared.setError(null)
  await whenQueueIdle()
}

/** Answers whose check is still pending are left out: they have no recorded outcome yet.
 * Read it AFTER waitForQueuedSaves so a check that settled during the wait is included. */
function withoutPendingAnswers(answers: Map<string, DraftAnswer>, pending: Set<string>) {
  if (pending.size === 0) return answers
  return new Map([...answers].filter(([qId]) => !pending.has(qId)))
}

/** Arms the hard-navigation fallback for a soft nav that never unmounts this component. */
function armNavFallback(deps: SubmitDeps) {
  if (deps.navFallbackTimer.current) clearTimeout(deps.navFallbackTimer.current)
  deps.navFallbackTimer.current = setTimeout(() => {
    // Soft nav didn't unmount us → it was cancelled (#909). Hard-navigate to the
    // same destination; safe even if it fires after a slow-but-successful nav.
    window.location.assign(examReportUrl(deps.examMode, deps.sessionId))
  }, NAV_FALLBACK_MS)
}

export function buildHandleSubmit(
  deps: BaseDeps & {
    answersRef: React.RefObject<Map<string, DraftAnswer>>
    pendingQuestionIdRef: React.RefObject<Set<string>>
    navFallbackTimer: React.RefObject<ReturnType<typeof setTimeout> | null>
    setShowFinishDialog: (v: boolean) => void
    questions: SessionQuestion[]
    isExam?: boolean
    examMode?: DbQuizMode
  },
) {
  const sharedFor = buildSharedFor(deps)
  return async function handleSubmit() {
    if (deps.inFlight.current || deps.submitted.current) return
    deps.inFlight.current = true
    const onSuccess = () => {
      deps.submitted.current = true
      deps.setShowFinishDialog(false)
    }
    await waitForQueuedSaves(sharedFor('submit'))
    const safeAnswers = withoutPendingAnswers(
      deps.answersRef.current,
      deps.pendingQuestionIdRef.current,
    )
    await dispatchSubmission({ deps, sharedFor, answers: safeAnswers, onSuccess }).finally(() => {
      // If submit rejected/threw before any setSubmitting(false), release the re-entry lock
      // so the student can retry. On success onSuccess set submitted.current = true first, so
      // the lock intentionally stays engaged here (terminal — navigating to the report).
      if (!deps.submitted.current) deps.inFlight.current = false
    })
    if (deps.submitted.current) armNavFallback(deps)
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
  return async function handleSave() {
    await waitForQueuedSaves(sharedFor('save'))
    const safeAnswers = withoutPendingAnswers(
      deps.answersRef.current,
      deps.pendingQuestionIdRef.current,
    )
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
  return async function handleDiscard() {
    await waitForQueuedSaves(sharedFor('discard'))
    return handleDiscardSession({
      userId: deps.userId,
      sessionId: deps.sessionId,
      draftId: deps.draftId,
      ...sharedFor('discard'),
    })
  }
}
