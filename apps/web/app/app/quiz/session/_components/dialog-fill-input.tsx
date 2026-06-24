'use client'

import { Loader2 } from 'lucide-react'
import { DialogLine } from './dialog-line'
import { useDialogFillInput } from './use-dialog-fill-input'

type DialogFillInputProps = {
  /** Stripped dialog template (`{{n}}` markers) from get_quiz_questions. */
  template: string
  onSubmit: (blanks: { index: number; text: string }[]) => void
  /** Disabled while a session-level submit is in flight. */
  disabled: boolean
  /** True only while this answer is being checked — drives the spinner. */
  submitting?: boolean
  /** Whether an answer has been submitted (locks the inputs + drives reveal). */
  submitted?: boolean
  /** Per-blank grading results once submitted, keyed by blank index. */
  blanks?: { index: number; isCorrect: boolean; canonical: string }[]
}

export function DialogFillInput({
  template,
  onSubmit,
  disabled,
  submitting = false,
  submitted = false,
  blanks,
}: DialogFillInputProps) {
  const { lines, values, results, allFilled, handleChange, collectSubmission } = useDialogFillInput(
    template,
    blanks,
  )

  const locked = submitted

  function handleSubmit() {
    const payload = collectSubmission()
    if (payload) onSubmit(payload)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-lg border border-border p-4">
        {lines.map((line, i) => (
          <DialogLine
            // Parsed lines are stable per template; index key is safe.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable parsed lines
            key={`line-${i}`}
            line={line}
            values={values}
            onChange={handleChange}
            disabled={disabled}
            results={results}
            locked={locked}
          />
        ))}
      </div>

      {!locked && (
        <button
          type="button"
          disabled={!allFilled || disabled || submitting}
          aria-busy={submitting || undefined}
          onClick={handleSubmit}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Submit Answer
          </span>
        </button>
      )}
    </div>
  )
}
