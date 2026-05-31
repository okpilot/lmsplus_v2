// Helpers and bounds for the active-exam-session reads (mock_exam +
// internal_exam). Extracted so the actions stay under the 100-line cap from
// .claude/rules/code-style.md §1 after Layer 1 partitioning.

// Deliberate read bound for getActiveExamSession / getActiveInternalExamSession
// (#668 instance #9). Active (ended_at IS NULL) exam sessions per student are
// structurally ~0–2; >this signals data corruption, not normal usage. The cap
// makes the bound explicit instead of relying on PostgREST's implicit max_rows
// (1000) silent truncation, and bounds the per-row complete_overdue_exam_session
// RPC loop in both readers. 50 ≫ any real count, ≪ 1000.
export const MAX_ACTIVE_EXAM_SESSIONS = 50

export function extractQuestionIds(config: unknown): string[] | null {
  if (typeof config !== 'object' || config === null) return null
  const ids = (config as Record<string, unknown>).question_ids
  if (!Array.isArray(ids) || ids.length === 0) return null
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) return null
  return ids as string[]
}

// DB CHECK: pass_mark > 0 AND pass_mark <= 100. Session-storage validator enforces
// the same range — both must agree to avoid a server-accepts / client-rejects split.
export function extractPassMark(config: unknown): number | null {
  if (typeof config !== 'object' || config === null) return null
  const pm = (config as Record<string, unknown>).pass_mark
  if (typeof pm !== 'number' || !Number.isInteger(pm) || pm <= 0 || pm > 100) return null
  return pm
}

// 30s grace window mirrors batch_submit_quiz (mig 047) and Layer 1 RPC
// (mig 052). A TS-only check that fires sooner would call complete_overdue
// which RAISEs 'session is not overdue' and routes the row to the orphaned
// banner — diverging UI from the truth on the server.
const OVERDUE_GRACE_SECONDS = 30

export function isExamOverdue(startedAt: string, timeLimitSeconds: number): boolean {
  if (timeLimitSeconds <= 0) return false
  const startedMs = Date.parse(startedAt)
  if (!Number.isFinite(startedMs)) return false
  return Date.now() > startedMs + (timeLimitSeconds + OVERDUE_GRACE_SECONDS) * 1000
}
