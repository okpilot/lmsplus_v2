export type ReportContext = { noun: string; backHref: string; backLabel: string }

// VFR RT Practice sessions are ordinary quiz_sessions rows scoped to the 'RT' subject
// and started via /app/vfr-rt, which mints mode='quick_quiz'. Keying off that exact mode
// (not a broad "any non-exam RT session") keeps every other mode — exam modes, and any
// future RT-scoped mode — in the default "Quiz" branch, which is what we want.
// NB: we check quick_quiz specifically rather than PRACTICE_MODES.includes(mode) because
// the other PRACTICE_MODES entry, 'smart_review', is dead FSRS plumbing (removed from the
// product; cleanup tracked in #1104) — quick_quiz is the only reachable RT practice mode.
const RT_SUBJECT_CODE = 'RT'

// True for VFR RT practice sessions specifically — also used to pick the canonical report
// route (`/app/vfr-rt/report` vs `/app/quiz/report`) so the sidebar highlights the right
// nav item.
export function isVfrRtPracticeReport(mode: string, subjectCode: string | null): boolean {
  return mode === 'quick_quiz' && subjectCode === RT_SUBJECT_CODE
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
