'use client'

import { useEffect, useState } from 'react'

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
}: FinishQuizDialogProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)

  // Reset confirmation state when dialog closes so stale panels don't persist
  useEffect(() => {
    if (!open) {
      setConfirmingDiscard(false)
      setConfirmingSubmit(false)
    }
  }, [open])

  if (!open) return null

  const unanswered = totalQuestions - answeredCount

  function handleClose() {
    setConfirmingDiscard(false)
    setConfirmingSubmit(false)
    onCancel()
  }

  function handleSubmitClick() {
    setConfirmingDiscard(false)
    if (unanswered > 0 && !confirmingSubmit) {
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
        aria-label="Finish quiz"
      >
        <h2 className="text-lg font-semibold text-foreground">Finish Quiz</h2>

        <p className="mt-3 text-sm text-muted-foreground">
          You have answered {answeredCount} of {totalQuestions} questions.
        </p>

        {confirmingSubmit && unanswered > 0 && (
          <div className="mt-4 rounded-lg border border-orange-400/40 bg-orange-500/10 p-4">
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
              {unanswered} {unanswered === 1 ? 'question is' : 'questions are'} unanswered and will
              be skipped.
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

        {confirmingDiscard && (
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
          {answeredCount > 0 ? (
            <button
              type="button"
              onClick={handleSubmitClick}
              disabled={submitting}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          ) : (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Answer at least one question to submit.
            </p>
          )}
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
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Return to Quiz
          </button>
        </div>
      </div>
    </div>
  )
}
