'use client'

import { Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { parseDialogDisplay } from '../_utils/parse-dialog-display'
import { type BlankResult, DialogLine } from './dialog-line'

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
  const lines = useMemo(() => parseDialogDisplay(template), [template])
  const blankIndices = useMemo(
    () =>
      Array.from(
        new Set(
          lines.flatMap((l) => l.segments.filter((s) => s.type === 'blank').map((s) => s.index)),
        ),
      ),
    [lines],
  )
  const [values, setValues] = useState<Record<number, string>>({})

  const results: Record<number, BlankResult> = useMemo(() => {
    const map: Record<number, BlankResult> = {}
    for (const b of blanks ?? []) map[b.index] = { isCorrect: b.isCorrect, canonical: b.canonical }
    return map
  }, [blanks])

  const locked = submitted
  const showResult = locked && (blanks?.length ?? 0) > 0
  const allFilled =
    blankIndices.length > 0 && blankIndices.every((i) => (values[i] ?? '').trim().length > 0)

  function handleChange(index: number, value: string) {
    setValues((prev) => ({ ...prev, [index]: value }))
  }

  function handleSubmit() {
    if (!allFilled) return
    onSubmit(blankIndices.map((i) => ({ index: i, text: (values[i] ?? '').trim() })))
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

      {!showResult && (
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
