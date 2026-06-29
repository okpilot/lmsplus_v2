export const MODE_LABELS = {
  smart_review: 'Smart Review',
  quick_quiz: 'Quick Quiz',
  mock_exam: 'Practice Exam',
  internal_exam: 'Internal Exam',
  vfr_rt_exam: 'VFR RT Mock Exam',
  // Discovery (Study Mode) is ephemeral + browse-only. Labelled defensively so a
  // discovery row can never render as "Practice Exam" via a `?? MODE_LABELS.mock_exam`
  // fallback — it is never scored and has no exam report.
  discovery: 'Discovery',
} as const

export type QuizMode = keyof typeof MODE_LABELS

export const EXAM_MODES = ['mock_exam', 'internal_exam', 'vfr_rt_exam'] as const

export const isExamMode = (mode: string): mode is 'mock_exam' | 'internal_exam' | 'vfr_rt_exam' =>
  (EXAM_MODES as readonly string[]).includes(mode)
