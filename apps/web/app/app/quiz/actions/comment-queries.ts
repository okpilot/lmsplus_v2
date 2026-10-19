import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, POSTGREST_MAX_ROWS, toPageResult } from '@/lib/supabase-paginate'

// users!user_id is the FK-hint form (code-style.md §5): fail loudly on FK
// resolution errors instead of silently returning null. Mirrors the
// `users!student_id` embeds in admin/internal-exams/queries.ts.
export const COMMENT_SELECT =
  'id, question_id, user_id, body, created_at, users!user_id(full_name, role)' as const

function commentRows(supabase: SupabaseClient<Database>, questionId: string, count?: 'exact') {
  return supabase
    .from('question_comments')
    .select(COMMENT_SELECT, count ? { count } : undefined)
    .eq('question_id', questionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
}

export async function fetchQuestionComments(
  supabase: SupabaseClient<Database>,
  questionId: string,
) {
  const first = await commentRows(supabase, questionId, 'exact').range(0, POSTGREST_MAX_ROWS - 1)
  return fetchAllRows(
    async () => ({ count: first.count, error: first.error }),
    async (from, to) => {
      // Page 0 is the query above; only later pages hit the database again.
      const { data, error } =
        from === 0 ? first : await commentRows(supabase, questionId).range(from, to)
      return toPageResult<NonNullable<typeof data>[number]>(data, error, 'question_comments')
    },
  )
}
