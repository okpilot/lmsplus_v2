'use client'

import { useMemo, useState } from 'react'
import { parseDialogDisplay } from '../_utils/parse-dialog-display'
import type { BlankResult } from './dialog-line'

export type DialogBlank = { index: number; isCorrect: boolean; canonical: string }

// Derives the ordered, de-duplicated blank indices from a parsed dialog
// template. Pure helper, exported for direct testing.
export function deriveBlankIndices(template: string): number[] {
  const lines = parseDialogDisplay(template)
  return Array.from(
    new Set(lines.flatMap((l) => l.segments.filter((s) => s.type === 'blank').map((s) => s.index))),
  )
}

// Maps the per-blank grading results (keyed by blank index) for the DialogLine
// render. Pure helper, exported for direct testing.
export function toBlankResults(blanks: DialogBlank[] | undefined): Record<number, BlankResult> {
  const map: Record<number, BlankResult> = {}
  for (const b of blanks ?? []) map[b.index] = { isCorrect: b.isCorrect, canonical: b.canonical }
  return map
}

// Shapes the submit payload from the current input values, trimming each blank.
// Pure helper, exported for direct testing.
export function buildSubmitPayload(
  blankIndices: number[],
  values: Record<number, string>,
): { index: number; text: string }[] {
  return blankIndices.map((i) => ({ index: i, text: (values[i] ?? '').trim() }))
}

// Seeds the input values from a resumed draft answer. Pure helper, exported for direct testing.
export function toSeedValues(
  submittedBlanks: { index: number; text: string }[] | null | undefined,
): Record<number, string> {
  const map: Record<number, string> = {}
  for (const b of submittedBlanks ?? []) map[b.index] = b.text
  return map
}

export type UseDialogFillInputResult = {
  lines: ReturnType<typeof parseDialogDisplay>
  values: Record<number, string>
  results: Record<number, BlankResult>
  allFilled: boolean
  handleChange: (index: number, value: string) => void
  /** Returns the trimmed payload when every blank is filled, else null. */
  collectSubmission: () => { index: number; text: string }[] | null
}

// Owns the dialog-fill input's derivation + interaction logic so the component
// stays render-focused (code-style.md §2 — no business logic in components).
export function useDialogFillInput(
  template: string,
  blanks: DialogBlank[] | undefined,
  /**
   * What the student typed on a previous visit, from the resumed draft. Seeds the boxes so a
   * graded question shows the ANSWER THEY GAVE beside the canonical — without it a resumed
   * wrong answer renders as an empty red box next to the right answer, which tells the student
   * nothing about what they got wrong. Mirrors ShortAnswerInput's `submittedText`.
   */
  submittedBlanks?: { index: number; text: string }[] | null,
): UseDialogFillInputResult {
  const lines = useMemo(() => parseDialogDisplay(template), [template])
  const blankIndices = useMemo(() => deriveBlankIndices(template), [template])
  // Seeded via useState's initialiser, not an effect: the control is keyed by question.id and so
  // remounts per question, and a resumed answer never changes under it.
  const [values, setValues] = useState<Record<number, string>>(() => toSeedValues(submittedBlanks))

  const results = useMemo(() => toBlankResults(blanks), [blanks])
  const allFilled =
    blankIndices.length > 0 && blankIndices.every((i) => (values[i] ?? '').trim().length > 0)

  function handleChange(index: number, value: string) {
    setValues((prev) => ({ ...prev, [index]: value }))
  }

  function collectSubmission(): { index: number; text: string }[] | null {
    if (!allFilled) return null
    return buildSubmitPayload(blankIndices, values)
  }

  return { lines, values, results, allFilled, handleChange, collectSubmission }
}
