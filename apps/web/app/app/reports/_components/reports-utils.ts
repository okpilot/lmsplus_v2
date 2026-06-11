export const MODE_LABELS: Record<string, string> = {
  smart_review: 'Study',
  quick_quiz: 'Study',
  mock_exam: 'Practice Exam',
  internal_exam: 'Internal Exam',
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Renders a pre-computed minute count as `Xm` under an hour and `Xh Ym` at or above it,
// so long sessions read as "27h 9m" instead of a raw "1629m".
export function formatDurationMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
