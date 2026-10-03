import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-paginate'
import type { GdprExportPayload } from './types'

type ProgressRow = GdprExportPayload['quiz_progress'][number]

/**
 * The student's own progress rows, discarded quizzes included. Scoped by `student_id` because
 * the admin client bypasses RLS; partial data is discarded on error (the caller logs it).
 */
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
