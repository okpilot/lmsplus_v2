'use client'

import type { CSSProperties, KeyboardEvent } from 'react'
import type { BlankResult } from '../_utils/dialog-fill-helpers'

/**
 * Enter pressed in the blank at this index. Submits or advances — the parent decides.
 * The ELEMENT travels with the index because a template may repeat the same blank index,
 * so the index alone does not identify which box was typed in.
 */
export type OnBlankEnter = (index: number, el: HTMLInputElement) => void

type DialogBlankProps = {
  index: number
  value: string
  onChange: (index: number, value: string) => void
  disabled: boolean
  /** Grading result for this blank once submitted; absent before submit. */
  result: BlankResult | undefined
  onEnter?: OnBlankEnter
}

function blankClass(result: BlankResult | undefined): string {
  if (!result) return 'border-border focus:border-primary'
  return result.isCorrect
    ? 'border-green-500 bg-green-500/10'
    : 'border-destructive bg-destructive/10'
}

/**
 * Character-count estimate for the blank's width, published as a custom property rather than as
 * `width` so the stylesheet can win without `!important` (an inline `width` outranks every rule).
 * The box grows with what the STUDENT types, never with the answer: the exam format brackets whole
 * phrases (the briefing's own example is "[descending to 2500 feet]", 25 chars), so a fixed box
 * truncates a correct answer out of view — while sizing an EMPTY box to its canonical would leak
 * the answer's length, which is why blanks_safe ships index-only and the floor stays uniform.
 *
 * The estimate overshoots (`ch` is the width of "0"; proportional text is narrower), so
 * globals.css prefers `field-sizing: content` where supported and keeps this as the fallback.
 */
function blankWidthCh(value: string): string {
  return `${Math.max(15, value.length + 2)}ch`
}

function handleBlankKeyDown(
  e: KeyboardEvent<HTMLInputElement>,
  index: number,
  onEnter?: OnBlankEnter,
) {
  // Enter during an IME composition is the candidate-commit keypress, not a submit. Calling
  // preventDefault there cancels the composition and then submits or steals focus, so a
  // Japanese/Chinese/Korean student cannot type a blank at all. `keyCode === 229` is the legacy
  // signal for engines that omit `isComposing`. Per CLAUDE.md's sibling-audit rule, the same
  // guard is applied to short-answer-input.tsx, which submits on Enter the same way.
  if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
  // Never let Enter reach a surrounding form and reload the page.
  e.preventDefault()
  onEnter?.(index, e.currentTarget)
}

/**
 * One blank inside a dialog line: the input the student types into, plus the canonical revealed
 * beneath it when the blank was graded wrong.
 *
 * `min-w-0` lets the box shrink inside the wrapping flow instead of forcing the transcript wider
 * than its container — it pairs with the `max-width: 100%` in globals.css, without which a long
 * answer in a 200-char blank overflows the dialog panel horizontally.
 */
export function DialogBlank({
  index,
  value,
  onChange,
  disabled,
  result,
  onEnter,
}: Readonly<DialogBlankProps>) {
  return (
    <span className="inline-flex min-w-0 flex-col">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        disabled={disabled}
        aria-label={`Blank ${index + 1}`}
        data-testid={`blank-${index}`}
        onKeyDown={(e) => handleBlankKeyDown(e, index, onEnter)}
        style={{ '--blank-w': blankWidthCh(value) } as CSSProperties}
        className={`dialog-blank-input inline-block rounded border px-2 py-1 text-sm transition-colors disabled:opacity-70 ${blankClass(result)}`}
      />
      {result && !result.isCorrect && (
        <span
          className="break-words text-xs text-muted-foreground"
          data-testid={`blank-canonical-${index}`}
        >
          {result.canonical}
        </span>
      )}
    </span>
  )
}
