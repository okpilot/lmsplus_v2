'use client'

import { Loader2 } from 'lucide-react'
import { useState } from 'react'

type ShortAnswerInputProps = {
  onSubmit: (text: string) => void
  /** Disabled while a session-level submit is in flight. */
  disabled: boolean
  /** True only while this answer is being checked — drives the spinner. */
  submitting?: boolean
  /** The student's already-submitted answer, if any. Presence locks the input. */
  submittedText?: string | null
  /** Grading outcome once an answer is submitted (drives the reveal). */
  isCorrect?: boolean | null
  /** Canonical answer revealed after submit. */
  correctAnswer?: string | null
}

export function ShortAnswerInput({
  onSubmit,
  disabled,
  submitting = false,
  submittedText,
  isCorrect,
  correctAnswer,
}: Readonly<ShortAnswerInputProps>) {
  const [value, setValue] = useState('')
  const locked = submittedText != null
  const showResult = locked && isCorrect != null
  const display = locked ? submittedText : value
  const trimmed = value.trim()
  const canSubmit = trimmed !== '' && !disabled && !submitting && !locked

  function submit() {
    if (canSubmit) onSubmit(trimmed)
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        // Auto-focus on mount. The control is keyed by question.id (remounts per
        // question), so this lands focus in the field on every new question — the
        // student can type immediately without clicking. A locked/answered question
        // renders the input disabled, so autoFocus is a no-op there (correct).
        // biome-ignore lint/a11y/noAutofocus: intentional — single-input drill step, keyed per question
        autoFocus
        value={display ?? ''}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        disabled={disabled || locked}
        aria-label="Your answer"
        data-testid="short-answer-input"
        className={`w-full rounded-lg border px-4 py-3 text-sm transition-colors disabled:opacity-70 ${
          showResult && isCorrect
            ? 'border-green-500 bg-green-500/10'
            : showResult
              ? 'border-destructive bg-destructive/10'
              : 'border-border focus:border-primary'
        }`}
      />

      {showResult && (
        <p role="status" aria-live="polite" className="sr-only">
          {isCorrect ? 'Correct' : 'Incorrect'}
        </p>
      )}

      {showResult && !isCorrect && correctAnswer != null && (
        <p className="text-sm text-muted-foreground" data-testid="revealed-answer">
          Correct answer: <span className="font-medium text-foreground">{correctAnswer}</span>
        </p>
      )}

      {!locked && (
        <button
          type="button"
          disabled={!canSubmit}
          aria-busy={submitting || undefined}
          onClick={submit}
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
