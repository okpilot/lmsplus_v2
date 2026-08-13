'use client'

import { Loader2 } from 'lucide-react'
import { useRef } from 'react'
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
  /** What the student typed previously, from a resumed draft. */
  submittedBlanks?: { index: number; text: string }[] | null
}

export function DialogFillInput({
  template,
  onSubmit,
  disabled,
  submitting = false,
  submitted = false,
  blanks,
  submittedBlanks,
}: Readonly<DialogFillInputProps>) {
  const { lines, values, results, allFilled, handleChange, collectSubmission } = useDialogFillInput(
    template,
    blanks,
    submittedBlanks,
  )

  const rootRef = useRef<HTMLDivElement>(null)
  const locked = submitted
  const graded = locked && blanks != null
  const allBlanksCorrect = graded && blanks.every((b) => b.isCorrect)

  function handleSubmit() {
    const payload = collectSubmission()
    if (payload) onSubmit(payload)
  }

  /**
   * Enter inside a blank. Mirrors short-answer-input, which submits on Enter — but a dialog has
   * several boxes, so Enter only submits once they are ALL filled (the same condition that
   * enables the button). Otherwise it moves to the next still-empty blank, which is what a
   * student pressing Enter mid-dialogue actually wants. Reading the DOM rather than tracking
   * focus in state keeps the visual order authoritative: `values` is keyed by blank index, and a
   * template may place a higher index earlier in the line.
   */
  function handleEnter(index: number) {
    if (allFilled) {
      if (!disabled && !submitting) handleSubmit()
      return
    }
    const inputs = Array.from(
      rootRef.current?.querySelectorAll<HTMLInputElement>('input[data-testid^="blank-"]') ?? [],
    )
    const from = inputs.findIndex((el) => el.dataset.testid === `blank-${index}`)
    const next =
      inputs.slice(from + 1).find((el) => el.value.trim() === '') ??
      inputs.find((el) => el.value.trim() === '')
    next?.focus()
  }

  return (
    <div className="space-y-3">
      <div ref={rootRef} className="space-y-1 rounded-lg border border-border p-4">
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
            onEnter={handleEnter}
          />
        ))}
      </div>

      {graded && (
        <p role="status" aria-live="polite" className="sr-only">
          {allBlanksCorrect ? 'Correct' : 'Incorrect'}
        </p>
      )}

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
