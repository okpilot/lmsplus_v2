export const MODE_LABELS: Record<string, string> = {
  smart_review: 'Study',
  quick_quiz: 'Study',
  mock_exam: 'Exam',
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
