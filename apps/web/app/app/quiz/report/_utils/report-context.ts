import { isExamMode } from '@/lib/constants/exam-modes'

export type ReportContext = { noun: string; backHref: string; backLabel: string }

// VFR RT Practice sessions are ordinary quiz_sessions rows (mode='quick_quiz') scoped
// to the 'RT' subject — there is no dedicated mode to key off, so subject code is the
// signal. Exam-mode sessions on the RT subject (e.g. a future vfr_rt_exam) fall through
// to the default "Quiz" branch — this context is for practice sessions only.
const RT_SUBJECT_CODE = 'RT'

export function getReportContext(mode: string, subjectCode: string | null): ReportContext {
  if (subjectCode === RT_SUBJECT_CODE && !isExamMode(mode)) {
    return { noun: 'Practice', backHref: '/app/vfr-rt', backLabel: 'Start Another Practice' }
  }
  return { noun: 'Quiz', backHref: '/app/quiz', backLabel: 'Start Another Quiz' }
}
