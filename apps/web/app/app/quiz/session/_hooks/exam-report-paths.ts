import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'

/** Report route per exam mode; every other mode uses `/app/quiz/report`. */
export const EXAM_REPORT_PATHS: Partial<Record<DbQuizMode, string>> = {
  internal_exam: '/app/internal-exam/report',
  vfr_rt_exam: '/app/vfr-rt/report',
}

/** Report URL of a finished session, whatever its mode. */
export function reportUrl(mode: DbQuizMode | undefined, sessionId: string): string {
  return `${(mode && EXAM_REPORT_PATHS[mode]) ?? '/app/quiz/report'}?session=${sessionId}`
}
