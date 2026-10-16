import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'

export type ReportSessionRow = {
  id: string
  mode: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number
  correct_count: number
  score_percentage: number | string | null
  passed: boolean | null
  time_limit_seconds: number | null
}

export type ReportAnswerRow = { question_id: string; answered_at: string }

export type ReportSessionResult =
  | { ok: true; session: ReportSessionRow; answerRows: ReportAnswerRow[] }
  | { ok: false }

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

async function fetchEndedSession(
  supabase: SupabaseClient,
  sessionId: string,
  studentId: string,
): Promise<ReportSessionRow | null> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select(
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage, passed, time_limit_seconds',
    )
    .eq('id', sessionId)
    .eq('student_id', studentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('[loadReportSession] Session query error:', error.message)
    return null
  }
  const session = data as ReportSessionRow | null
  // Only serve reports for completed sessions — prevents mid-session answer exposure
  if (!session?.ended_at) return null
  return session
}

// Page through ALL answer rows: the multi-row non-MC types (dialog_fill blanks, ordering
// slots, diagram_label zones) store one row per blank/slot/zone, and a session can hold up
// to 500 questions, exceeding PostgREST's max_rows cap.
function fetchAnswerRows(supabase: SupabaseClient, sessionId: string) {
  return fetchAllRows<ReportAnswerRow>(
    () =>
      supabase
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    async (from, to) => {
      const { data, error } = await supabase
        .from('quiz_session_answers')
        .select('question_id, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      return toPageResult<ReportAnswerRow>(data, error, 'quiz_session_answers')
    },
  )
}

// Cache key is sessionId only; identity comes from the cache()d getSessionUser of the
// same request, so one render reads the session and its answer rows once.
export const loadReportSession = cache(async (sessionId: string): Promise<ReportSessionResult> => {
  const supabase = await createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return { ok: false }

  const session = await fetchEndedSession(supabase, sessionId, user.id)
  if (!session) return { ok: false }

  const { data: answerRows, error } = await fetchAnswerRows(supabase, sessionId)
  if (error) {
    console.error('[loadReportSession] Answer rows query error:', error.message)
    return { ok: false }
  }
  return { ok: true, session, answerRows }
})
