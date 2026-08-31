import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'

// users!user_id is the FK-hint form (code-style.md §5): fail loudly on FK
// resolution errors instead of silently returning null. Mirrors the
// `users!student_id` embeds in admin/internal-exams/queries.ts.
export const COMMENT_SELECT =
  'id, question_id, user_id, body, created_at, users!user_id(full_name, role)' as const

export function fetchQuestionComments(supabase: SupabaseClient<Database>, questionId: string) {
  return fetchAllRows(
    () =>
      supabase
        .from('question_comments')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', questionId)
        .is('deleted_at', null),
    async (from, to) => {
      // Guard the page, as the sibling pagers do (lib/supabase-rpc.ts,
      // lib/queries/admin-report-helpers.ts): a page resolving { data: null, error: null }
      // lies inside [0, total) because the count already reported rows there, so it is a
      // count/page disagreement — and fetchAllRows' `if (data) all.push(...data)` would
      // skip it, truncating the thread into a comment list that reads as complete.
      const { data, error } = await supabase
        .from('question_comments')
        .select(COMMENT_SELECT)
        .eq('question_id', questionId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      return toPageResult<NonNullable<typeof data>[number]>(data, error, 'question_comments')
    },
  )
}
