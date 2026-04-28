// Helpers for getActiveExamSession. Extracted so the action stays under the
// 100-line cap from .claude/rules/code-style.md §1 after Layer 1 partitioning.

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
  if (typeof pm !== 'number' || !Number.isFinite(pm) || pm <= 0 || pm > 100) return null
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
