import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'

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

const ProgressPayload = z.object({ answers: z.array(z.unknown()) })

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

async function countAnswered(supabase: SupabaseClient, sessionId: string): Promise<number> {
  const { data, error } = await rpc<unknown>(supabase, 'get_quiz_progress', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(`Failed to fetch saved quiz progress: ${error.message}`)
  const parsed = ProgressPayload.safeParse(data)
  if (!parsed.success)
    throw new Error('Failed to fetch saved quiz progress: unexpected progress payload')
  return parsed.data.answers.length
}

async function toSavedQuiz(supabase: SupabaseClient, row: SavedRow): Promise<SavedQuizSession> {
  const subject = row.easa_subjects as { name?: unknown; short?: unknown } | null
  return {
    sessionId: row.id,
    mode: row.mode,
    savedAt: row.saved_at ?? '',
    subjectName: typeof subject?.name === 'string' ? subject.name : 'Unknown subject',
    subjectCode: typeof subject?.short === 'string' ? subject.short : '',
    totalCount: countQuestions(row.config),
    answeredCount: await countAnswered(supabase, row.id),
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
  return Promise.all((data ?? []).map((row) => toSavedQuiz(supabase, row)))
}
