import { type QuizMode as DbQuizMode, MODE_LABELS } from '@/lib/constants/exam-modes'

// Hook-free helpers + public types for useFinishQuizDialog. Split out of
// use-finish-quiz-dialog.ts to keep that hook file under the 80-line hook cap
// (code-style.md §1) — all React state/effects stay in the hook.

export type UseFinishQuizDialogOpts = {
  open: boolean
  answeredCount: number
  totalQuestions: number
  submitting: boolean
  onSubmit: () => void
  onCancel: () => void
  isExam?: boolean
  examMode?: DbQuizMode
  timeExpired?: boolean
}

export type FinishDialogView = {
  unanswered: number
  isInternalExam: boolean
  examLabel: string | null
  title: string
  canDismiss: boolean
  canDiscard: boolean
}

// The hook's return: the pure view fields (via intersection, so they can't drift
// from deriveFinishDialogView's output) plus the stateful countdown/confirm flags
// and the interaction handlers.
export type FinishQuizDialogState = FinishDialogView & {
  countdown: number
  confirmingDiscard: boolean
  confirmingSubmit: boolean
  handleClose: () => void
  handleSubmitClick: () => void
  cancelSubmitConfirm: () => void
  openDiscardConfirm: () => void
  cancelDiscardConfirm: () => void
}

// Pure derivation of the dialog's display state from the current opts. No hooks.
export function deriveFinishDialogView(opts: {
  answeredCount: number
  totalQuestions: number
  isExam?: boolean
  examMode?: DbQuizMode
  timeExpired?: boolean
}): FinishDialogView {
  const { answeredCount, totalQuestions, isExam, examMode, timeExpired } = opts
  const unanswered = totalQuestions - answeredCount
  const isInternalExam = !!isExam && examMode === 'internal_exam'
  const examLabel = isExam ? (MODE_LABELS[examMode ?? 'mock_exam'] ?? 'Exam') : null
  const title = isExam ? `Finish ${examLabel}` : 'Finish Quiz'
  // canDismiss gates the backdrop close + Escape close + Return-to-quiz button.
  // Internal exams DO allow dismissing the dialog (student returns to attempt) — discard
  // is the only thing internal_exam disallows. That's gated separately via canDiscard.
  const canDismiss = !(timeExpired && isExam)
  const canDiscard = canDismiss && !isInternalExam
  return { unanswered, isInternalExam, examLabel, title, canDismiss, canDiscard }
}

// Builds the dialog's click handlers over the hook's setters + derived state. No hooks —
// mirrors the builder-factory pattern in session/_hooks/quiz-submit-handlers.ts.
export function buildFinishDialogHandlers(deps: {
  canDismiss: boolean
  unanswered: number
  confirmingSubmit: boolean
  timeExpired?: boolean
  onCancel: () => void
  onSubmit: () => void
  setConfirmingDiscard: (v: boolean) => void
  setConfirmingSubmit: (v: boolean) => void
}) {
  return {
    handleClose() {
      if (!deps.canDismiss) return
      deps.setConfirmingDiscard(false)
      deps.setConfirmingSubmit(false)
      deps.onCancel()
    },
    handleSubmitClick() {
      deps.setConfirmingDiscard(false)
      if (deps.unanswered > 0 && !deps.confirmingSubmit && !deps.timeExpired) {
        deps.setConfirmingSubmit(true)
        return
      }
      deps.onSubmit()
    },
    cancelSubmitConfirm() {
      deps.setConfirmingSubmit(false)
    },
    openDiscardConfirm() {
      deps.setConfirmingSubmit(false)
      deps.setConfirmingDiscard(true)
    },
    cancelDiscardConfirm() {
      deps.setConfirmingDiscard(false)
    },
  }
}
