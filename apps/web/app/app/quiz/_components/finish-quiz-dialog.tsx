'use client'

import { useRef } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { useConnectionBlocked } from '../session/_hooks/use-connection-state'
import type { QuizPendingAction } from '../session/_hooks/use-quiz-submit'
import { DialogBody } from './finish-quiz-dialog/dialog-body'
import { DialogFooter } from './finish-quiz-dialog/dialog-footer'
import { useFinishQuizDialog } from './finish-quiz-dialog/use-finish-quiz-dialog'

type FinishQuizDialogProps = {
  open: boolean
  answeredCount: number
  totalQuestions: number
  /** True while any of submit/save/discard is in flight — disables every button. */
  submitting: boolean
  /** Which action is in flight — drives each button's own spinner + label. */
  pendingAction?: QuizPendingAction
  error?: string | null
  onSubmit: () => void
  onCancel: () => void
  onSave: () => void
  onDiscard: () => void
  isExam?: boolean
  /** DB-level exam mode. Drives title and discard-button visibility. */
  examMode?: DbQuizMode
  timeExpired?: boolean
  /** A picked option on the current question that was never submitted. */
  pendingSelection?: boolean
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function FinishQuizDialog({
  open,
  answeredCount,
  totalQuestions,
  submitting,
  pendingAction,
  error,
  onSubmit,
  onCancel,
  onSave,
  onDiscard,
  isExam,
  examMode,
  timeExpired,
  pendingSelection,
}: Readonly<FinishQuizDialogProps>) {
  const {
    countdown,
    confirmingDiscard,
    confirmingSubmit,
    unanswered,
    canDismiss,
    canDiscard,
    examLabel,
    title,
    handleClose,
    handleSubmitClick,
    cancelSubmitConfirm,
    openDiscardConfirm,
    cancelDiscardConfirm,
  } = useFinishQuizDialog({
    open,
    answeredCount,
    totalQuestions,
    submitting,
    onSubmit,
    onCancel,
    isExam,
    examMode,
    timeExpired,
  })

  const blocked = useConnectionBlocked()
  const popupRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog
      open={open && !blocked}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      disablePointerDismissal={!canDismiss || submitting}
    >
      <DialogContent
        ref={popupRef}
        initialFocus={popupRef}
        showCloseButton={false}
        overlayClassName="bg-scrim supports-backdrop-filter:backdrop-blur-none"
        className="block max-h-(--dialog-max-h) overflow-y-auto p-6 sm:max-w-dialog-md"
      >
        <DialogTitle className="text-heading">{title}</DialogTitle>
        <DialogBody
          answeredCount={answeredCount}
          totalQuestions={totalQuestions}
          submitting={submitting}
          pendingAction={pendingAction}
          error={error}
          isExam={isExam}
          timeExpired={timeExpired}
          pendingSelection={pendingSelection}
          countdown={countdown}
          unanswered={unanswered}
          confirmingSubmit={confirmingSubmit}
          confirmingDiscard={confirmingDiscard}
          canDiscard={canDiscard}
          onSubmit={onSubmit}
          onDiscard={onDiscard}
          cancelSubmitConfirm={cancelSubmitConfirm}
          cancelDiscardConfirm={cancelDiscardConfirm}
        />

        <DialogFooter
          answeredCount={answeredCount}
          submitting={submitting}
          pendingAction={pendingAction}
          isExam={isExam}
          examLabel={examLabel}
          timeExpired={timeExpired}
          canDismiss={canDismiss}
          canDiscard={canDiscard}
          onSubmitClick={handleSubmitClick}
          onSave={onSave}
          onDiscardOpen={openDiscardConfirm}
          onClose={handleClose}
        />
      </DialogContent>
    </Dialog>
  )
}
