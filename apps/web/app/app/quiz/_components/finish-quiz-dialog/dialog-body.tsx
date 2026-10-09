'use client'

import type { QuizPendingAction } from '../../session/_hooks/use-quiz-submit'
import { DiscardConfirm, SubmitConfirm } from './dialog-confirms'
import { DialogSummary, ErrorLine } from './dialog-summary'

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
      <DialogSummary
        answeredCount={answeredCount}
        totalQuestions={totalQuestions}
        submitting={submitting}
        countdown={countdown}
        isExam={isExam}
        timeExpired={timeExpired}
        pendingSelection={pendingSelection}
      />
      <SubmitConfirm
        confirming={confirmingSubmit}
        timeExpired={timeExpired}
        unanswered={unanswered}
        isExam={isExam}
        submitting={submitting}
        pendingAction={pendingAction}
        onSubmit={onSubmit}
        onCancel={cancelSubmitConfirm}
      />
      <DiscardConfirm
        confirming={confirmingDiscard}
        canDiscard={canDiscard}
        isExam={isExam}
        submitting={submitting}
        pendingAction={pendingAction}
        onDiscard={onDiscard}
        onCancel={cancelDiscardConfirm}
      />
      <ErrorLine message={error} />
    </>
  )
}
