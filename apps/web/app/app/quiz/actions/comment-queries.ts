import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-paginate'

export const COMMENT_SELECT =
  'id, question_id, user_id, body, created_at, users(full_name, role)' as const

export function fetchQuestionComments(supabase: SupabaseClient<Database>, questionId: string) {
  return fetchAllRows(
    () =>
      supabase
        .from('question_comments')
        .select('*', { count: 'exact', head: true })
        .eq('question_id', questionId)
        .is('deleted_at', null),
    (from, to) =>
      supabase
        .from('question_comments')
        .select(COMMENT_SELECT)
        .eq('question_id', questionId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
  )
}
