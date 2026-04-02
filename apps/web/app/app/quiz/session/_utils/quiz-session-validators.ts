export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function hasValidOptionalFields(d: Record<string, unknown>, questionCount: number): boolean {
  return (
    (!('draftAnswers' in d) ||
      d.draftAnswers === undefined ||
      (typeof d.draftAnswers === 'object' &&
        d.draftAnswers !== null &&
        !Array.isArray(d.draftAnswers))) &&
    (!('draftCurrentIndex' in d) ||
      d.draftCurrentIndex === undefined ||
      (Number.isInteger(d.draftCurrentIndex) &&
        (d.draftCurrentIndex as number) >= 0 &&
        (d.draftCurrentIndex as number) < questionCount)) &&
    (!('draftId' in d) || d.draftId === undefined || isNonEmptyString(d.draftId)) &&
    (!('subjectName' in d) || d.subjectName === undefined || typeof d.subjectName === 'string') &&
    (!('subjectCode' in d) || d.subjectCode === undefined || typeof d.subjectCode === 'string')
  )
}
