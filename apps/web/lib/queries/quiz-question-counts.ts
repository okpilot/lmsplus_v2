import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'

export type QuestionCountRow = {
  subject_id: string
  topic_id: string
  subtopic_id: string | null
  // bigint COUNT(*) — PostgREST may serialize it as a string; coerce with Number() at every read site.
  n: number | string
}

/**
 * Per-row guard required by code-style.md §5 — the client's generated types are a TypeScript
 * assertion only, not a runtime guarantee. The caller drops malformed rows and keeps the rest,
 * matching the sibling per-row guards in `study-queries.ts` and
 * `app/app/quiz/actions/lookup.ts` (path qualified — that one is not in this directory).
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
 * topics and subtopics. Extracted out of that file.
 *
 * Throws on an RPC error, a non-array payload, or when every row fails the shape check, so callers
 * see the failure instead of zero counts: `SubjectsSection` (subject picker) reaches
 * `apps/web/app/app/error.tsx` (Sentry); `lookup.ts`, `get-rt-subject.ts` and
 * `quiz-setup-preload.ts` catch it and render empty.
 * An individual malformed row is logged and dropped; the remaining rows are returned.
 */
export async function fetchActiveQuestionCounts(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<QuestionCountRow[]> {
  const { data, error } = await supabase.rpc('get_question_counts', {
    p_status: 'active',
  })
  if (error) throw new Error(`Failed to fetch question counts: ${error.message}`)
  if (!Array.isArray(data)) {
    throw new Error(
      `Failed to fetch question counts: payload is ${data === null ? 'null' : typeof data}`,
    )
  }
  const rows = data.filter(isQuestionCountRow)
  if (data.length > 0 && rows.length === 0) {
    throw new Error('Failed to fetch question counts: every row failed the shape check')
  }
  if (rows.length !== data.length) {
    console.error(
      `[fetchActiveQuestionCounts] dropped ${data.length - rows.length} of ${data.length} malformed row(s)`,
    )
  }
  return rows
}

/**
 * Request-scoped (`cache()`) active-count read: the subject list and the topic trees of one
 * setup render share a single `get_question_counts` call. A no-op outside an RSC render.
 */
export const getActiveQuestionCounts = cache(async (): Promise<QuestionCountRow[]> => {
  return fetchActiveQuestionCounts(await createServerSupabaseClient())
})
