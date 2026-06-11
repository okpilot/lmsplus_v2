import { createServerSupabaseClient } from '@repo/db/server'

/**
 * Reads which of the given question IDs the current student has actively flagged.
 *
 * Non-throwing by design: flag state is decorative on the report page, so a
 * transient DB/RLS hiccup degrades to "nothing flagged" rather than breaking the
 * whole report render. Mirrors the `console.error + return` posture of the sibling
 * report helpers in `quiz-report.ts`. Scoped to `auth.uid()` via the
 * `active_flagged_questions` security_invoker view.
 */
export async function getFlaggedQuestionIds(questionIds: string[]): Promise<string[]> {
  if (questionIds.length === 0) return []

  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return []

  const { data, error } = await supabase
    .from('active_flagged_questions')
    .select('question_id')
    .eq('student_id', user.id)
    .in('question_id', questionIds)

  if (error) {
    console.error('[getFlaggedQuestionIds] Query error:', error.message)
    return []
  }

  // View columns typed nullable (Postgres artifact); safe to cast — underlying table has NOT NULL constraints.
  return data.map((r) => r.question_id as string)
}
