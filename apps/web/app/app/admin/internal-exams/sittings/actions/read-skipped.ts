export type SkippedRow = { userId: string; subjectId: string; reason: string; detailAt?: string }

/** `add_exam_sitting_entries.skipped` (jsonb, at most 50 rows) as typed rows; malformed entries are dropped. */
export function readSkipped(raw: unknown): SkippedRow[] {
  if (!Array.isArray(raw)) return []
  const out: SkippedRow[] = []
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue
    const o = r as Record<string, unknown>
    const { user_id: userId, subject_id: subjectId, reason, detail_at: detailAt } = o
    if (typeof userId !== 'string' || typeof subjectId !== 'string' || typeof reason !== 'string') {
      continue
    }
    out.push({ userId, subjectId, reason, ...(typeof detailAt === 'string' ? { detailAt } : {}) })
  }
  return out
}
