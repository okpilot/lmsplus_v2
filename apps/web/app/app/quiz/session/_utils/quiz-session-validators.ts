import { EXAM_MODES } from '@/lib/constants/exam-modes'

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNullableString(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

function isValidBlankAnswers(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false
  return v.every(
    (b) =>
      typeof b === 'object' &&
      b !== null &&
      isNonNegativeInt((b as Record<string, unknown>).index) &&
      isNonEmptyString((b as Record<string, unknown>).text),
  )
}

export function isValidDraftAnswer(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (!Number.isInteger(r.responseTimeMs) || (r.responseTimeMs as number) < 0) return false
  // Exactly one answer SHAPE must be present by key, then that shape must be
  // valid — mirrors draft.ts's Zod .refine, which rejects a hybrid even when the
  // second payload is itself malformed.
  const hasSelectedOption = r.selectedOptionId !== undefined
  const hasResponseText = r.responseText !== undefined
  const hasBlankAnswers = r.blankAnswers !== undefined
  const hasOrder = r.order !== undefined
  if (
    [hasSelectedOption, hasResponseText, hasBlankAnswers, hasOrder].filter(Boolean).length !== 1
  ) {
    return false
  }
  if (hasSelectedOption) return isNonEmptyString(r.selectedOptionId)
  if (hasResponseText) return isNonEmptyString(r.responseText)
  if (hasOrder) {
    // An ordering question always has ≥2 items, so a submitted order is ≥2 — parity
    // with the save schema (draft-schema `order: z.array(...).min(2)`).
    return Array.isArray(r.order) && r.order.length >= 2 && r.order.every(isNonEmptyString)
  }
  return isValidBlankAnswers(r.blankAnswers)
}

function hasValidExplanations(r: Record<string, unknown>): boolean {
  return isNullableString(r.explanationText) && isNullableString(r.explanationImageUrl)
}

function isValidDialogFillFeedback(blanks: unknown): boolean {
  return (
    Array.isArray(blanks) &&
    blanks.length > 0 &&
    blanks.every(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        isNonNegativeInt((b as Record<string, unknown>).index) &&
        typeof (b as Record<string, unknown>).isCorrect === 'boolean' &&
        typeof (b as Record<string, unknown>).canonical === 'string',
    )
  )
}

export function isValidFeedbackEntry(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (typeof r.isCorrect !== 'boolean' || !hasValidExplanations(r)) return false

  // Dispatch on the questionType discriminant. Legacy persisted MC feedback
  // predates the tag (no `questionType`), so an untagged entry (case undefined)
  // carrying a non-empty `correctOptionId` is still accepted as multiple_choice.
  switch (r.questionType) {
    case 'multiple_choice':
    case undefined:
      return isNonEmptyString(r.correctOptionId)
    case 'short_answer':
      return isNullableString(r.correctAnswer)
    case 'dialog_fill':
      return isValidDialogFillFeedback(r.blanks)
    case 'ordering':
      return (
        Array.isArray(r.correctOrder) &&
        // An ordering question always has ≥2 items, so the canonical order is ≥2
        // — four-way parity with the save schema (draft-schema .min(2)), the RPC
        // guard (isOrderingRpcResult) and the DB-load path (toFeedbackEntry).
        r.correctOrder.length >= 2 &&
        r.correctOrder.every(isNonEmptyString)
      )
    default:
      return false
  }
}

export function isValidRecordOf(val: unknown, check: (v: unknown) => boolean): boolean {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  return Object.values(val).every(check)
}

function isOptionalFieldValid(
  d: Record<string, unknown>,
  key: string,
  check: (v: unknown) => boolean,
): boolean {
  return !(key in d) || d[key] === undefined || check(d[key])
}

export function hasValidOptionalFields(d: Record<string, unknown>, questionCount: number): boolean {
  return (
    isOptionalFieldValid(d, 'draftAnswers', (v) => isValidRecordOf(v, isValidDraftAnswer)) &&
    isOptionalFieldValid(d, 'draftFeedback', (v) => isValidRecordOf(v, isValidFeedbackEntry)) &&
    isOptionalFieldValid(
      d,
      'draftCurrentIndex',
      (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < questionCount,
    ) &&
    isOptionalFieldValid(d, 'draftId', (v) => isNonEmptyString(v)) &&
    isOptionalFieldValid(d, 'subjectName', (v) => typeof v === 'string') &&
    isOptionalFieldValid(d, 'subjectCode', (v) => typeof v === 'string') &&
    isOptionalFieldValid(d, 'mode', (v) => v === 'study' || v === 'exam') &&
    isOptionalFieldValid(d, 'examMode', (v) =>
      (EXAM_MODES as readonly string[]).includes(v as string),
    ) &&
    isOptionalFieldValid(d, 'timeLimitSeconds', (v) => typeof v === 'number' && v > 0) &&
    isOptionalFieldValid(d, 'passMark', (v) => typeof v === 'number' && v > 0 && v <= 100) &&
    isOptionalFieldValid(d, 'startedAt', (v) => typeof v === 'string')
  )
}
