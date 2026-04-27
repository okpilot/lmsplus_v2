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

export function isExamOverdue(startedAt: string, timeLimitSeconds: number): boolean {
  if (timeLimitSeconds <= 0) return false
  const startedMs = Date.parse(startedAt)
  if (!Number.isFinite(startedMs)) return false
  return Date.now() > startedMs + timeLimitSeconds * 1000
}
