'use client'

import type { QuizPendingAction } from '../../session/_hooks/use-quiz-submit'
import { ConfirmPanel } from './confirm-panel'
import { ExpiredNotice } from './expired-notice'

type DialogBodyProps = {
  answeredCount: number
  totalQuestions: number
  submitting: boolean
  pendingAction?: QuizPendingAction
  error?: string | null
  isExam?: boolean
  timeExpired?: boolean
  pendingSelection?: boolean
  countdown: number
  unanswered: number
  confirmingSubmit: boolean
  confirmingDiscard: boolean
  canDiscard: boolean
  onSubmit: () => void
  onDiscard: () => void
  cancelSubmitConfirm: () => void
  cancelDiscardConfirm: () => void
}

/** The counts line or expiry notice, the unsubmitted-pick warning, the confirm panels and the error. */
export function DialogBody({
  answeredCount,
  totalQuestions,
  submitting,
  pendingAction,
  error,
  isExam,
  timeExpired,
  pendingSelection,
  countdown,
  unanswered,
  confirmingSubmit,
  confirmingDiscard,
  canDiscard,
  onSubmit,
  onDiscard,
  cancelSubmitConfirm,
  cancelDiscardConfirm,
}: Readonly<DialogBodyProps>) {
  return (
    <>
      {timeExpired && isExam ? (
        <ExpiredNotice submitting={submitting} countdown={countdown} />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          You have answered {answeredCount} of {totalQuestions} questions.
        </p>
      )}
      {pendingSelection && (
        <p className="mt-3 text-sm font-medium text-caution">
          You picked an answer on this question but haven't submitted it.
        </p>
      )}
      {confirmingSubmit && unanswered > 0 && !timeExpired && (
        <ConfirmPanel
          message={`${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} unanswered${isExam ? ' and will be marked wrong.' : ' and will be skipped.'}`}
          confirmLabel={pendingAction === 'submit' ? 'Submitting...' : 'Submit anyway'}
          onConfirm={onSubmit}
          onCancel={cancelSubmitConfirm}
          submitting={submitting}
          busy={pendingAction === 'submit'}
          variant="warning"
        />
      )}
      {confirmingDiscard && canDiscard && (
        <ConfirmPanel
          message={
            isExam
              ? "Are you sure? Your progress will be lost. This attempt won't count."
              : 'Are you sure? Your progress will be lost.'
          }
          confirmLabel={pendingAction === 'discard' ? 'Discarding...' : 'Yes, discard'}
          onConfirm={onDiscard}
          onCancel={cancelDiscardConfirm}
          submitting={submitting}
          busy={pendingAction === 'discard'}
          variant="destructive"
        />
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
