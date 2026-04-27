'use client'

import { useEffect, useState } from 'react'
import { useAutoSubmitCountdown } from '../_hooks/use-auto-submit-countdown'

type FinishQuizDialogProps = {
  open: boolean
  answeredCount: number
  totalQuestions: number
  submitting: boolean
  error?: string | null
  onSubmit: () => void
  onCancel: () => void
  onSave: () => void
  onDiscard: () => void
  isExam?: boolean
  timeExpired?: boolean
}

export function FinishQuizDialog({
  open,
  answeredCount,
  totalQuestions,
  submitting,
  error,
  onSubmit,
  onCancel,
  onSave,
  onDiscard,
  isExam,
  timeExpired,
}: FinishQuizDialogProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)
  const countdown = useAutoSubmitCountdown({
    active: open && !!timeExpired && !!isExam,
    seconds: 10,
    submitting,
    onSubmit,
  })

  useEffect(() => {
    if (!open || (timeExpired && isExam)) {
      setConfirmingDiscard(false)
      setConfirmingSubmit(false)
    }
  }, [open, timeExpired, isExam])

  if (!open) return null

  const unanswered = totalQuestions - answeredCount
  const title = isExam ? 'Finish Practice Exam' : 'Finish Quiz'
  const canDismiss = !(timeExpired && isExam)

  function handleClose() {
    if (!canDismiss) return
    setConfirmingDiscard(false)
    setConfirmingSubmit(false)
    onCancel()
  }

  function handleSubmitClick() {
    setConfirmingDiscard(false)
    if (unanswered > 0 && !confirmingSubmit && !timeExpired) {
      setConfirmingSubmit(true)
      return
    }
    onSubmit()
  }

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
            confirmLabel={submitting ? 'Submitting...' : 'Submit anyway'}
            onConfirm={onSubmit}
            onCancel={() => setConfirmingSubmit(false)}
            submitting={submitting}
            variant="warning"
          />
        )}

        {confirmingDiscard && canDismiss && (
          <ConfirmPanel
            message={
              isExam
                ? "Are you sure? Your progress will be lost. This attempt won't count."
                : 'Are you sure? Your progress will be lost.'
            }
            confirmLabel={submitting ? 'Discarding...' : 'Yes, discard'}
            onConfirm={onDiscard}
            onCancel={() => setConfirmingDiscard(false)}
            submitting={submitting}
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
          isExam={isExam}
          timeExpired={timeExpired}
          canDismiss={canDismiss}
          onSubmitClick={handleSubmitClick}
          onSave={onSave}
          onDiscardOpen={() => {
            setConfirmingSubmit(false)
            setConfirmingDiscard(true)
          }}
          onClose={handleClose}
        />
      </div>
    </div>
  )
}

function ExpiredNotice({ submitting, countdown }: { submitting: boolean; countdown: number }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-4"
    >
      <p className="text-sm font-medium text-red-600 dark:text-red-400">
        Time expired! Your answers will be submitted automatically.
      </p>
      {!submitting && countdown > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Auto-submitting in {countdown}s...</p>
      )}
    </div>
  )
}

function DialogFooter({
  answeredCount,
  submitting,
  isExam,
  timeExpired,
  canDismiss,
  onSubmitClick,
  onSave,
  onDiscardOpen,
  onClose,
}: {
  answeredCount: number
  submitting: boolean
  isExam?: boolean
  timeExpired?: boolean
  canDismiss: boolean
  onSubmitClick: () => void
  onSave: () => void
  onDiscardOpen: () => void
  onClose: () => void
}) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      <button
        type="button"
        onClick={onSubmitClick}
        disabled={submitting || (answeredCount === 0 && !timeExpired)}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting
          ? 'Submitting...'
          : isExam
            ? 'Submit Practice Exam'
            : answeredCount > 0
              ? 'Submit Quiz'
              : 'Answer at least one question'}
      </button>
      {!isExam && (
        <button
          type="button"
          onClick={onSave}
          disabled={submitting}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Save for Later
        </button>
      )}
      {canDismiss && (
        <button
          type="button"
          onClick={onDiscardOpen}
          disabled={submitting}
          className="w-full rounded-lg border border-destructive/30 bg-background px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
        >
          {isExam ? 'Discard Practice Exam' : 'Discard Quiz'}
        </button>
      )}
      {canDismiss && (
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isExam ? 'Return to Practice Exam' : 'Return to Quiz'}
        </button>
      )}
    </div>
  )
}

function ConfirmPanel({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  submitting,
  variant,
}: {
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
  variant: 'warning' | 'destructive'
}) {
  const isWarn = variant === 'warning'
  return (
    <div
      className={`mt-4 rounded-lg border p-4 ${isWarn ? 'border-orange-400/40 bg-orange-500/10' : 'border-destructive/40 bg-destructive/10'}`}
    >
      <p
        className={`text-sm font-medium ${isWarn ? 'text-orange-600 dark:text-orange-400' : 'text-destructive'}`}
      >
        {message}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${isWarn ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isWarn ? 'Go back' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
