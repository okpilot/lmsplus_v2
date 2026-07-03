'use client'

import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { QuizPendingAction } from '../session/_hooks/use-quiz-submit'
import { ConfirmPanel } from './finish-quiz-dialog/confirm-panel'
import { DialogFooter } from './finish-quiz-dialog/dialog-footer'
import { ExpiredNotice } from './finish-quiz-dialog/expired-notice'
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
        {timeExpired && isExam ? (
          <ExpiredNotice submitting={submitting} countdown={countdown} />
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            You have answered {answeredCount} of {totalQuestions} questions.
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
