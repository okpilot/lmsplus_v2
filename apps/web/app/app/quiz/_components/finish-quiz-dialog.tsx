'use client'

import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
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

  if (!open) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop for click-outside dismiss
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') handleClose()
        }}
        aria-label={title}
      >
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
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
      </div>
    </div>
  )
}
