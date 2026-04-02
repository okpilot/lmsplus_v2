export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function isValidDraftAnswer(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return isNonEmptyString(r.selectedOptionId) && typeof r.responseTimeMs === 'number'
}

export function isValidFeedbackEntry(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.isCorrect === 'boolean' &&
    isNonEmptyString(r.correctOptionId) &&
    (r.explanationText === null || typeof r.explanationText === 'string') &&
    (r.explanationImageUrl === null || typeof r.explanationImageUrl === 'string')
  )
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
    isOptionalFieldValid(d, 'subjectCode', (v) => typeof v === 'string')
  )
}
