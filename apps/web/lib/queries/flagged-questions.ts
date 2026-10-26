import { createServerSupabaseClient } from '@repo/db/server'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { FLAG_FETCH_TIMEOUT_MS } from '@/lib/constants/flag-fetch-timeout'
import { withTimeout } from '@/lib/utils/with-timeout'

/**
 * Reads which of the given question IDs the current student has actively flagged.
 *
 * A query error or a missing user degrades to []. Client creation (missing env,
 * `cookies()`) can still reject; callers that must not fail use
 * getFlaggedQuestionIdsBounded. Scoped to `auth.uid()` via the
 * `active_flagged_questions` security_invoker view.
 */
export async function getFlaggedQuestionIds(questionIds: string[]): Promise<string[]> {
  if (questionIds.length === 0) return []

  const supabase = await createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return []

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

const TIMED_OUT: string[] = []

/** Never rejects: degrades to [] on failure or after FLAG_FETCH_TIMEOUT_MS. */
export async function getFlaggedQuestionIdsBounded(questionIds: string[]): Promise<string[]> {
  const result = await withTimeout(
    getFlaggedQuestionIds(questionIds).catch((e: unknown) => {
      console.error(
        '[getFlaggedQuestionIds] read failed:',
        e instanceof Error ? e.message : String(e),
      )
      return [] as string[]
    }),
    FLAG_FETCH_TIMEOUT_MS,
    TIMED_OUT,
  )
  if (result !== TIMED_OUT) return result
  console.error(`[getFlaggedQuestionIds] timed out after ${FLAG_FETCH_TIMEOUT_MS}ms`)
  return []
}
