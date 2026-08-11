import type { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

export type QuestionCountRow = {
  subject_id: string
  topic_id: string
  subtopic_id: string | null
  // bigint COUNT(*) — PostgREST may serialize it as a string; coerce with Number() at every read site.
  n: number | string
}

/**
 * Per-row guard required by code-style.md §5 — the `rpc<QuestionCountRow[]>` cast is a TypeScript
 * assertion only, not a runtime guarantee. The caller drops malformed rows and keeps the rest,
 * matching the sibling per-row guards in `lookup.ts`, `study-queries.ts` and
 * `quiz-session-queries.ts`.
 */
function isQuestionCountRow(value: unknown): value is QuestionCountRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.subject_id === 'string' &&
    typeof row.topic_id === 'string' &&
    (row.subtopic_id === null || typeof row.subtopic_id === 'string') &&
    // COUNT(*)::bigint — PostgREST may send it as a number or a digit string. Coerce once and test
    // finiteness so both wire forms are judged identically, matching the `Number(row.n)` every
    // consumer applies. Same shape as lookup.ts:150-151, plus a `typeof` gate that file lacks:
    // without it `n: null` would pass as a finite 0 and silently become a zero count.
    (typeof row.n === 'number' || typeof row.n === 'string') &&
    Number.isFinite(Number(row.n))
  )
}

/**
 * Shared active-question-count read for the quiz taxonomy queries — every exported
 * function in `quiz-subject-queries.ts` calls it to attach `questionCount` to subjects,
 * topics and subtopics. Extracted here so that file stays under the 200-line utility cap.
 *
 * Degrades to `[]` rather than throwing, so a counts failure cannot surface as an error page.
 * Note what that actually means for the caller: an absent count becomes `questionCount: 0`,
 * which every caller's `questionCount > 0` filter then drops — so an RPC failure renders an
 * EMPTY picker, not an undecorated one. The existing tests encode that (`toEqual([])`).
 *
 * A malformed ROW is narrower: it is dropped individually and the remaining rows still render,
 * so one drifted row costs one count rather than the whole picker.
 */
export async function fetchActiveQuestionCounts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<QuestionCountRow[]> {
  const { data, error } = await rpc<QuestionCountRow[]>(supabase, 'get_question_counts', {
    p_status: 'active',
  })
  if (error) {
    console.error('[fetchActiveQuestionCounts] get_question_counts error:', error.message)
    return []
  }
  if (!Array.isArray(data)) {
    // `null` (the RPC returned nothing) and a drifted return shape are different operational
    // facts, and `typeof null === 'object'` would collapse them into one message.
    console.error(
      '[fetchActiveQuestionCounts] payload is not an array:',
      data === null ? 'null' : typeof data,
    )
    return []
  }
  const rows = data.filter(isQuestionCountRow)
  if (rows.length !== data.length) {
    console.error(
      `[fetchActiveQuestionCounts] dropped ${data.length - rows.length} of ${data.length} malformed row(s)`,
    )
  }
  return rows
}
