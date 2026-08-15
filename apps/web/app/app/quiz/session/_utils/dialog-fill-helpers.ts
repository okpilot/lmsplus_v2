// Pure helpers + shared types behind the dialog_fill answer control
// (`_components/use-dialog-fill-input.ts`, `_components/dialog-line.tsx`).
//
// They live in `_utils/` rather than in the hook so the hook stays inside its 80-line cap
// (code-style.md §1), and so the dependency runs `_components/` → `_utils/` in one direction
// only: `toBlankResults` maps `DialogBlank[]` to `BlankResult`s, so both types have to sit
// beside it or `_utils/` would end up importing from `_components/`.

import { parseDialogDisplay } from './parse-dialog-display'

/** Per-blank grading outcome, rendered beside the blank once an answer is submitted. */
export type BlankResult = { isCorrect: boolean; canonical: string }

/** A graded blank as the quiz session hands it back, keyed by its blank index. */
export type DialogBlank = { index: number; isCorrect: boolean; canonical: string }

// Derives the ordered, de-duplicated blank indices from a parsed dialog template.
export function deriveBlankIndices(template: string): number[] {
  const lines = parseDialogDisplay(template)
  return Array.from(
    new Set(lines.flatMap((l) => l.segments.filter((s) => s.type === 'blank').map((s) => s.index))),
  )
}

// Maps the per-blank grading results (keyed by blank index) for the DialogLine render.
export function toBlankResults(blanks: DialogBlank[] | undefined): Record<number, BlankResult> {
  const map: Record<number, BlankResult> = {}
  for (const b of blanks ?? []) map[b.index] = { isCorrect: b.isCorrect, canonical: b.canonical }
  return map
}

// Shapes the submit payload from the current input values, trimming each blank.
export function buildSubmitPayload(
  blankIndices: number[],
  values: Record<number, string>,
): { index: number; text: string }[] {
  return blankIndices.map((i) => ({ index: i, text: (values[i] ?? '').trim() }))
}

// Seeds the input values from a resumed draft answer.
export function toSeedValues(
  submittedBlanks: { index: number; text: string }[] | null | undefined,
): Record<number, string> {
  const map: Record<number, string> = {}
  for (const b of submittedBlanks ?? []) map[b.index] = b.text
  return map
}
