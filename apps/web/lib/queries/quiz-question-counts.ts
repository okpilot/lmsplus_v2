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
 * Shared active-question-count read for the quiz taxonomy queries — every exported
 * function in `quiz-subject-queries.ts` calls it to attach `questionCount` to subjects,
 * topics and subtopics. Extracted here so that file stays under the 200-line utility cap.
 *
 * Degrades to `[]` rather than throwing, so a counts failure cannot surface as an error page.
 * Note what that actually means for the caller: an absent count becomes `questionCount: 0`,
 * which every caller's `questionCount > 0` filter then drops — so an RPC failure renders an
 * EMPTY picker, not an undecorated one. The existing tests encode that (`toEqual([])`).
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
  // rpc() casts the payload without validating shape — guard the array per code-style §5.
  return Array.isArray(data) ? data : []
}
