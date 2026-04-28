export const MODE_LABELS = {
  smart_review: 'Smart Review',
  quick_quiz: 'Quick Quiz',
  mock_exam: 'Practice Exam',
  internal_exam: 'Internal Exam',
} as const

export type QuizMode = keyof typeof MODE_LABELS

export const EXAM_MODES = ['mock_exam', 'internal_exam'] as const

export const isExamMode = (mode: string): mode is 'mock_exam' | 'internal_exam' =>
  (EXAM_MODES as readonly string[]).includes(mode)
