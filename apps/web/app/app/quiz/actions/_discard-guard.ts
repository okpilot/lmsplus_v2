// Helpers for discardQuiz. Extracted from discard.ts.

// Modes whose in-progress sessions must never be discarded by the student.
// The server is the real defense even if a UI bug exposes a discard button.
// Same set as the students_update_sessions mode exclusion (pinned by discard-mode-parity.integration.test.ts).
const NON_DISCARDABLE_MODES: Record<string, string> = {
  internal_exam: 'cannot_discard_internal_exam',
  vfr_rt_exam: 'cannot_discard_vfr_rt_exam',
}

/** Returns the error token to reject with, or null if the mode is discardable. */
export function discardBlockedError(mode: string): string | null {
  return NON_DISCARDABLE_MODES[mode] ?? null
}
