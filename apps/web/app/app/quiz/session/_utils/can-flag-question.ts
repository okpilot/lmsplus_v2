import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'

/**
 * Product policy: the flag/bookmark affordance is suppressed during a live
 * internal exam (a formal assessment). Extracted from QuizSessionFooter so the
 * component stays render-only and the rule is unit-testable (#908).
 */
export function canFlagQuestion(
  opts: Readonly<{ isExam: boolean; examMode?: DbQuizMode }>,
): boolean {
  return !(opts.isExam && opts.examMode === 'internal_exam')
}
