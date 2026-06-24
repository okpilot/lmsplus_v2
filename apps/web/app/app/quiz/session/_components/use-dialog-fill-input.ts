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
): UseDialogFillInputResult {
  const lines = useMemo(() => parseDialogDisplay(template), [template])
  const blankIndices = useMemo(() => deriveBlankIndices(template), [template])
  const [values, setValues] = useState<Record<number, string>>({})

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
