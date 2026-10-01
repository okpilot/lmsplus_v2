import { isDiscardableExamMode, type QuizMode } from '@/lib/constants/exam-modes'

/** Where a non-discardable exam's "Dismiss" navigates; null when the mode is discardable. */
export function getDismissTarget(examMode: QuizMode | undefined): string | null {
  if (isDiscardableExamMode(examMode)) return null
  return examMode === 'vfr_rt_exam' ? '/app/vfr-rt' : '/app/internal-exam'
}
