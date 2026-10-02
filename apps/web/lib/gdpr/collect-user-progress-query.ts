import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-paginate'
import type { GdprExportPayload } from './types'

export type ProgressRow = GdprExportPayload['quiz_progress'][number]

export function fetchUserProgress(supabase: SupabaseClient<Database>, userId: string) {
  return fetchAllRows<ProgressRow>(
    () =>
      supabase
        .from('quiz_session_progress')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId),
    (from, to) =>
      supabase
        .from('quiz_session_progress')
        .select('session_id, question_id, answer, time_spent_ms, answered_at, updated_at')
        .eq('student_id', userId)
        // The composite PK (session_id, question_id) is a total order; no surrogate id column exists.
        .order('session_id')
        .order('question_id')
        .range(from, to),
  )
}
