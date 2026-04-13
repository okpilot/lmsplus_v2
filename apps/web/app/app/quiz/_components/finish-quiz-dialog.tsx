'use client'

import { useEffect, useRef, useState } from 'react'

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
  const [autoSubmitCountdown, setAutoSubmitCountdown] = useState(10)
  const autoSubmitFiredRef = useRef(false)

  // Reset confirmation state when dialog closes
  useEffect(() => {
    if (!open) {
      setConfirmingDiscard(false)
      setConfirmingSubmit(false)
      setAutoSubmitCountdown(10)
      autoSubmitFiredRef.current = false
    }
  }, [open])

  // Auto-submit countdown for time-expired exam
  useEffect(() => {
    if (!open || !timeExpired || !isExam || submitting) return
    if (autoSubmitFiredRef.current) return
    const id = setInterval(() => {
      setAutoSubmitCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          if (!autoSubmitFiredRef.current) {
            autoSubmitFiredRef.current = true
            onSubmit()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [open, timeExpired, isExam, submitting, onSubmit])

  if (!open) return null

  const unanswered = totalQuestions - answeredCount
  const title = isExam ? 'Finish Exam' : 'Finish Quiz'
  const returnLabel = isExam ? 'Return to Exam' : 'Return to Quiz'

  function handleClose() {
    if (timeExpired && isExam) return // Can't dismiss time-expired dialog
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
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for click-outside dismiss
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
          <div className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Time expired! Your answers will be submitted automatically.
            </p>
            {!submitting && autoSubmitCountdown > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Auto-submitting in {autoSubmitCountdown}s...
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            You have answered {answeredCount} of {totalQuestions} questions.
          </p>
        )}

        {confirmingSubmit && unanswered > 0 && !timeExpired && (
          <div className="mt-4 rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
              {unanswered} {unanswered === 1 ? 'question is' : 'questions are'} unanswered
              {isExam ? ' and will be marked wrong.' : ' and will be skipped.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit anyway'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSubmit(false)}
                disabled={submitting}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                Go back
              </button>
            </div>
          </div>
        )}

        {!isExam && confirmingDiscard && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">
              Are you sure? Your progress will be lost.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={submitting}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {submitting ? 'Discarding...' : 'Yes, discard'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDiscard(false)}
                disabled={submitting}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={submitting || (answeredCount === 0 && !timeExpired)}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
              ? 'Submitting...'
              : isExam
                ? 'Submit Exam'
                : answeredCount > 0
                  ? 'Submit Quiz'
                  : 'Answer at least one question'}
          </button>

          {/* Save and Discard — hidden in exam mode */}
          {!isExam && (
            <>
              <button
                type="button"
                onClick={onSave}
                disabled={submitting}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                Save for Later
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingSubmit(false)
                  setConfirmingDiscard(true)
                }}
                disabled={submitting}
                className="w-full rounded-lg border border-destructive/30 bg-background px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                Discard Quiz
              </button>
            </>
          )}

          {/* Return button — hidden when time expired in exam */}
          {!(timeExpired && isExam) && (
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {returnLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
