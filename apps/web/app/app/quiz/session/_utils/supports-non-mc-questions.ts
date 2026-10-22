import type { QuizState } from '../_hooks/use-quiz-state'

// mock_exam/internal_exam start RPCs do not filter by question_type; only vfr_rt_exam renders
// non-MC answer controls in exam mode.
export function supportsNonMcQuestions(s: Pick<QuizState, 'isExam' | 'examMode'>): boolean {
  return !s.isExam || s.examMode === 'vfr_rt_exam'
}
