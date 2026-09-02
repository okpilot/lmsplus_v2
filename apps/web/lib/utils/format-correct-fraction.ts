/**
 * Format a "correct / answered" fraction for quiz report surfaces.
 *
 * The denominator is answered ITEMS, not the question count: `quiz_sessions.correct_count`
 * has been item-level (blank/slot/zone rows) since migration `20260624000100`, while
 * `total_questions` is the question count — dividing one by the other mixes scales.
 *
 * Returns an em dash when nothing was answered, rather than "0 / 0".
 */
export function formatCorrectFraction(correctCount: number, answeredItems: number): string {
  return answeredItems === 0 ? '—' : `${correctCount} / ${answeredItems}`
}
