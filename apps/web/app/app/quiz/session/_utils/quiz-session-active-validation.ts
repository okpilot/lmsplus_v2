import type { ActiveSession } from './quiz-session-storage'
import {
  isNonEmptyString,
  isValidDraftAnswer,
  isValidFeedbackEntry,
  isValidRecordOf,
} from './quiz-session-validators'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// Split out of quiz-session-storage.ts, which crossed its 200-line utility cap (code-style.md
// §1) when clearActiveSessionIfCurrent landed. The seam is deliberate: this file decides
// whether a stored payload is TRUSTWORTHY, the storage module does the localStorage I/O and
// owns the shape. `ActiveSession` is a type-only import, so the cycle between the two is
// erased at compile time and no runtime cycle exists.

// Exam mode requires startedAt + timeLimitSeconds for the timer. Reject pre-ship
// entries lacking them, and garbage (NaN/Infinity/non-positive, unparseable startedAt).
function hasValidExamTimerFields(d: Record<string, unknown>): boolean {
  if (d.mode !== 'exam') return true
  return (
    typeof d.startedAt === 'string' &&
    Number.isFinite(Date.parse(d.startedAt)) &&
    typeof d.timeLimitSeconds === 'number' &&
    Number.isFinite(d.timeLimitSeconds) &&
    d.timeLimitSeconds > 0
  )
}

// Active-session firewall: only 'study'/'exam' (or legacy undefined) may resume from
// localStorage — a stored 'discovery' (browse-only, never persists) or garbage is stale/
// tampered. DIVERGES from the handoff validator, which DOES admit 'discovery' (one-shot).
function hasValidResumableMode(d: Record<string, unknown>): boolean {
  return d.mode === undefined || d.mode === 'study' || d.mode === 'exam'
}

// Both time bounds off ONE clock read. The upper bound is not redundant: a FUTURE savedAt has
// a negative age, so the staleness check alone never expires it — a backwards clock change or
// a hand-edited entry would stay resumable until real time caught up to it.
function hasSaneSavedAt(savedAt: number): boolean {
  const now = Date.now()
  return savedAt <= now && now - savedAt <= SEVEN_DAYS_MS
}

// Returns false for any malformed/stale/cross-user/non-resumable payload so
// readActiveSession can purge it once (rather than per-branch).
//
// Deliberately narrower than the sibling isValidSessionData, which routes optional fields
// through hasValidOptionalFields. NOT validated here: subjectName, subjectCode, draftId,
// examMode, passMark — plus startedAt and timeLimitSeconds outside exam mode, where
// hasValidExamTimerFields short-circuits. So `data is ActiveSession` asserts more than it
// checks. Tolerable because the app's sole writer is buildActiveSession and JSON.stringify
// drops undefined keys; a hand-edited localStorage entry can still carry any of them, which
// is self-inflicted only (the userId guard holds and React escapes strings). Validate the
// full list above — not just the first five — if a second writer ever appears.
export function isValidActiveSession(data: unknown, userId: string): data is ActiveSession {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (
    !isNonEmptyString(d.sessionId) ||
    !Array.isArray(d.questionIds) ||
    typeof d.savedAt !== 'number' ||
    !Number.isFinite(d.savedAt) ||
    typeof d.currentIndex !== 'number' ||
    !Number.isInteger(d.currentIndex) ||
    d.currentIndex < 0 ||
    // Empty questionIds needs no clause of its own: currentIndex is proven a non-negative
    // integer above, so this bounds check fires at length 0. That needs the `< 0` clause to
    // be PRESENT — its position in the `||` is irrelevant; drop it and `[]` + `-1` validates.
    d.currentIndex >= d.questionIds.length ||
    typeof d.answers !== 'object' ||
    d.answers === null ||
    Array.isArray(d.answers)
  ) {
    return false
  }
  if (d.questionIds.some((id) => !isNonEmptyString(id))) return false
  if (!isValidRecordOf(d.answers, isValidDraftAnswer)) return false
  if (d.feedback !== undefined && !isValidRecordOf(d.feedback, isValidFeedbackEntry)) return false
  if (d.userId !== userId) return false // cross-user contamination guard
  if (!hasValidResumableMode(d)) return false
  if (!hasValidExamTimerFields(d)) return false
  if (!hasSaneSavedAt(d.savedAt)) return false
  return true
}
