'use client'

import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import type { QuizPendingAction } from '../../session/_hooks/use-quiz-submit'
import { getSubmitButtonLabel } from './finish-quiz-dialog-helpers'

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
  const submitLabel = getSubmitButtonLabel({ isSubmitting, isExam, examLabel, answeredCount })
  return (
    <div className="mt-6 flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        onClick={onSubmitClick}
        disabled={submitting || (answeredCount === 0 && !timeExpired)}
        aria-busy={isSubmitting || undefined}
        className="w-full"
      >
        <span className="inline-flex items-center justify-center gap-2">
          <BusyLabel busy={isSubmitting}>{submitLabel}</BusyLabel>
        </span>
      </Button>
      {!isExam && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onSave}
          disabled={submitting}
          aria-busy={isSaving || undefined}
          className="w-full"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <BusyLabel busy={isSaving}>{isSaving ? 'Saving...' : 'Save for Later'}</BusyLabel>
          </span>
        </Button>
      )}
      {canDiscard && (
        <Button
          type="button"
          variant="destructive"
          size="lg"
          onClick={onDiscardOpen}
          disabled={submitting}
          className="w-full"
        >
          {isExam ? `Discard ${examLabel ?? 'Exam'}` : 'Discard Quiz'}
        </Button>
      )}
      {canDismiss && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onClose}
          disabled={submitting}
          className="w-full"
        >
          {isExam ? `Return to ${examLabel ?? 'Exam'}` : 'Return to Quiz'}
        </Button>
      )}
    </div>
  )
}
