'use client'

import { useState } from 'react'

type FinishQuizDialogProps = {
  open: boolean
  answeredCount: number
  totalQuestions: number
  submitting: boolean
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
  onSubmit,
  onCancel,
  onSave,
  onDiscard,
}: FinishQuizDialogProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  if (!open) return null

  const unanswered = totalQuestions - answeredCount

  function handleClose() {
    setConfirmingDiscard(false)
    onCancel()
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
      <dialog
        open
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

        {unanswered > 0 && (
          <p className="mt-2 text-sm font-medium text-destructive">
            {unanswered} {unanswered === 1 ? 'question is' : 'questions are'} unanswered and will be
            skipped.
          </p>
        )}

        {confirmingDiscard ? (
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
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setConfirmingDiscard(true)}
              disabled={submitting}
              className="text-sm font-medium text-destructive underline-offset-4 transition-colors hover:underline disabled:opacity-50"
            >
              Discard Quiz
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Return to Quiz
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={submitting}
            className="rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Save for Later
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
