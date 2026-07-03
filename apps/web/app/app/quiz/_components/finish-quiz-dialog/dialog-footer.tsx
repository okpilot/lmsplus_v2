'use client'

import { Loader2 } from 'lucide-react'
import type { QuizPendingAction } from '../../session/_hooks/use-quiz-submit'

type DialogFooterProps = {
  answeredCount: number
  submitting: boolean
  pendingAction?: QuizPendingAction
  isExam?: boolean
  examLabel?: string | null
  timeExpired?: boolean
  canDismiss: boolean
  canDiscard: boolean
  onSubmitClick: () => void
  onSave: () => void
  onDiscardOpen: () => void
  onClose: () => void
}

export function DialogFooter({
  answeredCount,
  submitting,
  pendingAction,
  isExam,
  examLabel,
  timeExpired,
  canDismiss,
  canDiscard,
  onSubmitClick,
  onSave,
  onDiscardOpen,
  onClose,
}: Readonly<DialogFooterProps>) {
  // Every button is disabled while any action runs (`submitting`), but the spinner
  // and "…ing" label belong only to the button whose own action is in flight.
  const isSubmitting = pendingAction === 'submit'
  const isSaving = pendingAction === 'save'
  function submitButtonLabel() {
    if (isSubmitting) return 'Submitting...'
    if (isExam) return `Submit ${examLabel ?? 'Exam'}`
    if (answeredCount > 0) return 'Submit Quiz'
    return 'Answer at least one question'
  }
  return (
    <div className="mt-6 flex flex-col gap-2">
      <button
        type="button"
        onClick={onSubmitClick}
        disabled={submitting || (answeredCount === 0 && !timeExpired)}
        aria-busy={isSubmitting || undefined}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {isSubmitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {submitButtonLabel()}
        </span>
      </button>
      {!isExam && (
        <button
          type="button"
          onClick={onSave}
          disabled={submitting}
          aria-busy={isSaving || undefined}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSaving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save for Later'}
          </span>
        </button>
      )}
      {canDiscard && (
        <button
          type="button"
          onClick={onDiscardOpen}
          disabled={submitting}
          className="w-full rounded-lg border border-destructive/30 bg-background px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          {isExam ? `Discard ${examLabel ?? 'Exam'}` : 'Discard Quiz'}
        </button>
      )}
      {canDismiss && (
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isExam ? `Return to ${examLabel ?? 'Exam'}` : 'Return to Quiz'}
        </button>
      )}
    </div>
  )
}
