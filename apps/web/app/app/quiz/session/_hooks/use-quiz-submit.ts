import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { handleDiscardSession, handleSaveSession, handleSubmitSession } from './quiz-submit'

/** Which finish-dialog action is currently in flight, or null when idle. */
export type QuizPendingAction = 'submit' | 'save' | 'discard' | null

export function useQuizSubmit(opts: {
  userId: string
  sessionId: string
  questions: SessionQuestion[]
  answersRef: React.RefObject<Map<string, DraftAnswer>>
  feedbackRef: React.RefObject<Map<string, AnswerFeedback>>
  currentIndexRef: React.RefObject<number>
  pendingQuestionIdRef: React.RefObject<Set<string>>
  router: AppRouterInstance
  draftId?: string
  subjectName?: string
  subjectCode?: string
  isExam?: boolean
  examMode?: DbQuizMode
}) {
  const submitted = useRef(false)
  // Synchronous one-shot re-entry guard for handleSubmit (multi-source: timer/click/keyboard).
  // Separate from `submitted` (success flag) so failure resets the lock for retry.
  const inFlight = useRef(false)
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  // One action runs at a time (the dialog disables all buttons while any is pending),
  // so a single discriminator drives both per-button spinners and the derived `submitting`.
  const [pendingAction, setPendingAction] = useState<QuizPendingAction>(null)
  const submitting = pendingAction !== null
  const [error, setError] = useState<string | null>(null)
  const sharedFor = (action: Exclude<QuizPendingAction, null>) => ({
    router: opts.router,
    setSubmitting: (v: boolean) => {
      setPendingAction(v ? action : null)
      // Reset the submit re-entry lock when the submit finishes without having
      // succeeded (on success, onSuccess sets submitted.current = true first, so
      // inFlight stays locked — terminal; on error, submitted is still false —
      // retryable). Scoped to 'submit' so a save/discard completion can never
      // reset an in-flight submit's lock (inFlight is only set by handleSubmit).
      if (!v && action === 'submit' && !submitted.current) inFlight.current = false
    },
    setError,
  })

  function handleSubmit() {
    if (inFlight.current || submitted.current) return
    inFlight.current = true
    const pending = opts.pendingQuestionIdRef.current
    const safeAnswers =
      pending.size > 0
        ? new Map([...opts.answersRef.current].filter(([qId]) => !pending.has(qId)))
        : opts.answersRef.current
    return handleSubmitSession({
      userId: opts.userId,
      sessionId: opts.sessionId,
      answers: safeAnswers,
      draftId: opts.draftId,
      isExam: opts.isExam,
      examMode: opts.examMode,
      onSuccess: () => {
        submitted.current = true
        setShowFinishDialog(false)
      },
      ...sharedFor('submit'),
    }).finally(() => {
      // If submit rejected/threw before any setSubmitting(false), release the re-entry lock
      // so the student can retry. On success onSuccess set submitted.current = true first, so
      // the lock intentionally stays engaged here (terminal — navigating to the report).
      if (!submitted.current) inFlight.current = false
    })
  }

  function handleSave() {
    const pending = opts.pendingQuestionIdRef.current
    const safeAnswers =
      pending.size > 0
        ? new Map([...opts.answersRef.current].filter(([qId]) => !pending.has(qId)))
        : opts.answersRef.current
    return handleSaveSession({
      userId: opts.userId,
      sessionId: opts.sessionId,
      questions: opts.questions,
      answers: safeAnswers,
      feedback: opts.feedbackRef.current,
      currentIndex: opts.currentIndexRef.current,
      draftId: opts.draftId,
      subjectName: opts.subjectName,
      subjectCode: opts.subjectCode,
      ...sharedFor('save'),
    })
  }

  function handleDiscard() {
    return handleDiscardSession({
      userId: opts.userId,
      sessionId: opts.sessionId,
      draftId: opts.draftId,
      ...sharedFor('discard'),
    })
  }

  return {
    submitted,
    showFinishDialog,
    setShowFinishDialog,
    submitting,
    pendingAction,
    error,
    clearError: () => setError(null),
    handleSubmit,
    handleSave,
    handleDiscard,
  }
}
