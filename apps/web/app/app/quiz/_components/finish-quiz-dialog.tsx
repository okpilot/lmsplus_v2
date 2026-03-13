'use client'

type FinishQuizDialogProps = {
  open: boolean
  answeredCount: number
  totalQuestions: number
  submitting: boolean
  onSubmit: () => void
  onCancel: () => void
  onSave: () => void
}

export function FinishQuizDialog({
  open,
  answeredCount,
  totalQuestions,
  submitting,
  onSubmit,
  onCancel,
  onSave,
}: FinishQuizDialogProps) {
  if (!open) return null

  const unanswered = totalQuestions - answeredCount

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <dialog
        open
        className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
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

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
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
