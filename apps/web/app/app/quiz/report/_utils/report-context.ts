export type ReportContext = { noun: string; backHref: string; backLabel: string }

// VFR RT Practice sessions are ordinary quiz_sessions rows scoped to the 'RT' subject
// and started via /app/vfr-rt, which mints mode='quick_quiz'. getReportContext returns the
// RT practice context only for mode === 'quick_quiz' on the RT subject, the mock-exam context
// for mode === 'vfr_rt_exam', and the "Quiz" context for any other mode.
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

export function getReportContext(mode: string, subjectCode: string | null): ReportContext {
  if (mode === 'vfr_rt_exam') {
    return { noun: 'VFR RT Mock Exam', backHref: '/app/vfr-rt', backLabel: 'Back to VFR RT' }
  }
  if (isVfrRtPracticeReport(mode, subjectCode)) {
    return {
      noun: 'VFR RT Practice',
      backHref: '/app/vfr-rt',
      backLabel: 'Start Another Practice',
    }
  }
  return { noun: 'Quiz', backHref: '/app/quiz', backLabel: 'Start Another Quiz' }
}
