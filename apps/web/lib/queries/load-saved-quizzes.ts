import { createServerSupabaseClient } from '@repo/db/server'
import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'

export type SavedQuizSession = {
  sessionId: string
  mode: string
  savedAt: string
  subjectName: string
  subjectCode: string
  totalCount: number
  answeredCount: number
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// The server caps saved quizzes at 20 per student (save_quiz_for_later); the bound is explicit.
const MAX_SAVED_QUIZZES = 20

type SavedRow = {
  id: string
  mode: string
  saved_at: string | null
  config: unknown
  easa_subjects: unknown
}

function countQuestions(config: unknown): number {
  const ids = (config as { question_ids?: unknown } | null)?.question_ids
  return Array.isArray(ids) ? ids.length : 0
}

type ProgressRow = { session_id: string }

/**
 * Answered rows per saved session in one paginated read. A viewed-only progress row (answer
 * NULL, written by save_quiz_position) is not an answer. Own-row SELECT policy scopes the read;
 * the explicit student_id predicate stays for rule 11.
 */
async function countAnsweredBySession(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[],
): Promise<Map<string, number>> {
  const { data, error } = await fetchAllRows<ProgressRow>(
    () =>
      supabase
        .from('quiz_session_progress')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', userId)
        .in('session_id', sessionIds)
        .not('answer', 'is', null),
    async (from, to) => {
      const page = await supabase
        .from('quiz_session_progress')
        .select('session_id')
        .eq('student_id', userId)
        .in('session_id', sessionIds)
        .not('answer', 'is', null)
        .order('session_id', { ascending: true })
        .order('question_id', { ascending: true })
        .range(from, to)
      return toPageResult<ProgressRow>(page.data, page.error, 'quiz_session_progress')
    },
  )
  if (error) throw new Error(`Failed to fetch saved quiz progress: ${error.message}`)
  const counts = new Map<string, number>()
  for (const row of data) counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)
  return counts
}

function toSavedQuiz(row: SavedRow, answeredCount: number): SavedQuizSession {
  const subject = row.easa_subjects as { name?: unknown; short?: unknown } | null
  return {
    sessionId: row.id,
    mode: row.mode,
    savedAt: row.saved_at ?? '',
    subjectName: typeof subject?.name === 'string' ? subject.name : 'Unknown subject',
    subjectCode: typeof subject?.short === 'string' ? subject.short : '',
    totalCount: countQuestions(row.config),
    answeredCount,
  }
}

/**
 * The student's saved quizzes, newest first. Saved rows are soft-deleted by design, so no
 * `deleted_at` filter. The explicit `student_id` predicate stays even though RLS scopes the
 * read: several permissive SELECT policies exist on quiz_sessions (docs/security.md).
 */
export async function loadSavedQuizzes(userId: string): Promise<SavedQuizSession[]> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('id, mode, saved_at, config, easa_subjects!subject_id(name, short)')
    .eq('student_id', userId)
    .not('saved_at', 'is', null)
    .order('saved_at', { ascending: false })
    .limit(MAX_SAVED_QUIZZES)
  if (error) throw new Error(`Failed to fetch saved quizzes: ${error.message}`)
  const rows = data ?? []
  if (rows.length === 0) return []
  const answered = await countAnsweredBySession(
    supabase,
    userId,
    rows.map((r) => r.id),
  )
  return rows.map((row) => toSavedQuiz(row, answered.get(row.id) ?? 0))
}
