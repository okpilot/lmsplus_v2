import type { ActiveSession } from './quiz-session-storage'
import {
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

// Returns false for any malformed/stale/cross-user/non-resumable payload so
// readActiveSession can purge it once (rather than per-branch).
export function isValidActiveSession(data: ActiveSession, userId: string): boolean {
  // Required fields
  if (
    !data.sessionId ||
    !Array.isArray(data.questionIds) ||
    data.questionIds.length === 0 ||
    typeof data.savedAt !== 'number' ||
    typeof data.currentIndex !== 'number' ||
    !Number.isInteger(data.currentIndex) ||
    data.currentIndex < 0 ||
    data.currentIndex >= data.questionIds.length ||
    typeof data.answers !== 'object' ||
    data.answers === null ||
    Array.isArray(data.answers)
  ) {
    return false
  }
  if (data.questionIds.some((id) => typeof id !== 'string' || !id)) return false
  if (!isValidRecordOf(data.answers, isValidDraftAnswer)) return false
  if (data.feedback && !isValidRecordOf(data.feedback, isValidFeedbackEntry)) return false
  if (data.userId !== userId) return false // cross-user contamination guard
  // Active-session firewall: only 'study'/'exam' (or legacy undefined) may resume from
  // localStorage — a stored 'discovery' (browse-only, never persists) or garbage is stale/
  // tampered. DIVERGES from the handoff validator, which DOES admit 'discovery' (one-shot).
  if (data.mode !== undefined && data.mode !== 'study' && data.mode !== 'exam') return false
  // Exam mode requires startedAt + timeLimitSeconds for the timer. Reject pre-ship
  // entries lacking them, and garbage (NaN/Infinity/non-positive, unparseable startedAt).
  if (
    data.mode === 'exam' &&
    (typeof data.startedAt !== 'string' ||
      !Number.isFinite(Date.parse(data.startedAt)) ||
      typeof data.timeLimitSeconds !== 'number' ||
      !Number.isFinite(data.timeLimitSeconds) ||
      data.timeLimitSeconds <= 0)
  ) {
    return false
  }
  if (Date.now() - data.savedAt > SEVEN_DAYS_MS) return false // 7-day staleness
  return true
}
