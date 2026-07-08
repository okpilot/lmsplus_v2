import { isExamMode } from '@/lib/constants/exam-modes'

export type ReportContext = { noun: string; backHref: string; backLabel: string }

// VFR RT Practice sessions are ordinary quiz_sessions rows (mode='quick_quiz') scoped
// to the 'RT' subject — there is no dedicated mode to key off, so subject code is the
// signal. Exam-mode sessions on the RT subject (e.g. a future vfr_rt_exam) fall through
// to the default "Quiz" branch — this context is for practice sessions only.
const RT_SUBJECT_CODE = 'RT'

// True for VFR RT practice sessions specifically (not RT exam-mode sessions, which fall
// through to the default "Quiz" context) — also used to pick the canonical report route
// (`/app/vfr-rt/report` vs `/app/quiz/report`) so the sidebar highlights the right nav item.
export function isVfrRtPracticeReport(mode: string, subjectCode: string | null): boolean {
  return subjectCode === RT_SUBJECT_CODE && !isExamMode(mode)
}

export function getReportContext(mode: string, subjectCode: string | null): ReportContext {
  if (isVfrRtPracticeReport(mode, subjectCode)) {
    return {
      noun: 'VFR RT Practice',
      backHref: '/app/vfr-rt',
      backLabel: 'Start Another Practice',
    }
  }
  return { noun: 'Quiz', backHref: '/app/quiz', backLabel: 'Start Another Quiz' }
}
