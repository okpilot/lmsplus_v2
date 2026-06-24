import { EXAM_MODES } from '@/lib/constants/exam-modes'

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNullableString(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

function isValidBlankAnswers(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false
  return v.every(
    (b) =>
      typeof b === 'object' &&
      b !== null &&
      typeof (b as Record<string, unknown>).index === 'number' &&
      isNonEmptyString((b as Record<string, unknown>).text),
  )
}

export function isValidDraftAnswer(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  // Mirror draft.ts's Zod: responseTimeMs is a non-negative integer.
  if (!Number.isInteger(r.responseTimeMs) || (r.responseTimeMs as number) < 0) return false
  // Exactly one of the three answer shapes carries the payload (MC / short /
  // dialog) — a hybrid carrying two is rejected, matching the Zod .refine.
  const payloadCount = [
    isNonEmptyString(r.selectedOptionId),
    isNonEmptyString(r.responseText),
    isValidBlankAnswers(r.blankAnswers),
  ].filter(Boolean).length
  return payloadCount === 1
}

function hasValidExplanations(r: Record<string, unknown>): boolean {
  return isNullableString(r.explanationText) && isNullableString(r.explanationImageUrl)
}

function isValidDialogFillFeedback(blanks: unknown): boolean {
  return (
    Array.isArray(blanks) &&
    blanks.every(
      (b) =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as Record<string, unknown>).index === 'number' &&
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
