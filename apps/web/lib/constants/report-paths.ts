import type { QuizMode } from '@/lib/constants/exam-modes'

// VFR RT Practice sessions are ordinary quiz_sessions rows scoped to the 'RT' subject
// and started via /app/vfr-rt, which mints mode='quick_quiz'. RT_SUBJECT_CODE is easa_subjects.code.
// NB: we check quick_quiz specifically rather than PRACTICE_MODES.includes(mode) because
// the other PRACTICE_MODES entry, 'smart_review', is dead FSRS plumbing (removed from the
// product; cleanup tracked in #1104) — quick_quiz is the only reachable RT practice mode.
const RT_SUBJECT_CODE = 'RT'

// True for VFR RT practice sessions specifically.
export function isVfrRtPracticeReport(mode: string, subjectCode: string | null): boolean {
  return mode === 'quick_quiz' && subjectCode === RT_SUBJECT_CODE
}

// True for any VFR RT report (practice or mock exam) — picks the canonical report route
// (`/app/vfr-rt/report` vs `/app/quiz/report`) so the sidebar highlights the right nav item.
export function isVfrRtReport(mode: string, subjectCode: string | null): boolean {
  return isVfrRtPracticeReport(mode, subjectCode) || mode === 'vfr_rt_exam'
}

/** Report route per exam mode; every other mode uses `/app/quiz/report`. */
const EXAM_REPORT_PATHS: ReadonlyMap<string, string> = new Map<QuizMode, string>([
  ['internal_exam', '/app/internal-exam/report'],
])

/**
 * Report URL of a finished session, whatever its mode. `subjectCode` is `easa_subjects.code`;
 * it routes VFR RT practice sessions (mode 'quick_quiz') straight to the RT report.
 */
export const QUIZ_REPORT_PATH = '/app/quiz/report'
export const VFR_RT_REPORT_PATH = '/app/vfr-rt/report'

export function reportUrl(
  mode: string | undefined,
  sessionId: string,
  subjectCode?: string | null,
): string {
  const path =
    mode && isVfrRtReport(mode, subjectCode ?? null)
      ? VFR_RT_REPORT_PATH
      : ((mode && EXAM_REPORT_PATHS.get(mode)) ?? QUIZ_REPORT_PATH)
  return `${path}?session=${sessionId}`
}
