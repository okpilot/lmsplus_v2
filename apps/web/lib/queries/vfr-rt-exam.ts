import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

export type VfrRtSubject = { id: string; name: string }

// Mirrors the get_vfr_rt_exam_questions RPC row exactly (mig 105). options /
// dialog_template / blanks_safe arrive as jsonb and are server-stripped — no
// canonical answers or explanations are present.
export type VfrRtQuestion = {
  id: string
  question_type: 'short_answer' | 'dialog_fill' | 'multiple_choice'
  question_text: string
  question_image_url: string | null
  subject_code: string
  topic_code: string
  difficulty: string
  question_number: string
  options: { id: string; text: string }[] | null
  dialog_template: string | null
  blanks_safe: { index: number }[] | null
}

export type VfrRtInProgress =
  | { status: 'not_found' }
  | { status: 'completed' }
  | {
      status: 'active'
      sessionId: string
      startedAt: string
      timeLimitSeconds: number
      questions: VfrRtQuestion[]
    }

export async function getVfrRtSubject(): Promise<VfrRtSubject | null> {
  const supabase = await createServerSupabaseClient()

  // No auth gate here: this lookup uses no user identity (easa_subjects has
  // UNIQUE(code), no org_id, no deleted_at), and the page's requireAuthUser()
  // already guarantees the caller is authenticated.
  const { data, error } = await supabase
    .from('easa_subjects')
    .select('id, name')
    .eq('code', 'RT')
    .maybeSingle<VfrRtSubject>()

  if (error) {
    console.error('[getVfrRtSubject] Query error:', error.message)
    return null
  }

  return data ?? null
}

export async function getActiveVfrRtSession(): Promise<{ sessionId: string } | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getActiveVfrRtSession] Auth error:', authError.message)
    return null
  }
  if (!user) return null

  // Explicit student_id scope required — quiz_sessions has multiple permissive RLS SELECT policies
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('id')
    .eq('student_id', user.id)
    .eq('mode', 'vfr_rt_exam')
    .is('ended_at', null)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error('[getActiveVfrRtSession] Query error:', error.message)
    return null
  }

  return data ? { sessionId: data.id } : null
}

type SessionRow = {
  id: string
  started_at: string
  time_limit_seconds: number
  ended_at: string | null
}

export async function getVfrRtInProgress(sessionId: string): Promise<VfrRtInProgress> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getVfrRtInProgress] Auth error:', authError.message)
    return { status: 'not_found' }
  }
  if (!user) return { status: 'not_found' }

  // Explicit student_id scope required — quiz_sessions has multiple permissive
  // RLS SELECT policies (security.md "Multiple Permissive RLS SELECT Policies").
  const { data: row, error } = await supabase
    .from('quiz_sessions')
    .select('id, started_at, time_limit_seconds, ended_at')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .eq('mode', 'vfr_rt_exam')
    .is('deleted_at', null)
    .maybeSingle<SessionRow>()

  if (error) {
    console.error('[getVfrRtInProgress] Query error:', error.message)
    return { status: 'not_found' }
  }
  if (!row) return { status: 'not_found' }
  if (row.ended_at !== null) return { status: 'completed' }

  const { data, error: rpcError } = await rpc<VfrRtQuestion[]>(
    supabase,
    'get_vfr_rt_exam_questions',
    { p_session_id: sessionId },
  )
  // !Array.isArray covers null AND a truthy non-array payload (which would slip
  // a malformed `questions` into the active runner and crash its .map/.length).
  if (rpcError || !Array.isArray(data) || data.length === 0) {
    if (rpcError) console.error('[getVfrRtInProgress] RPC error:', rpcError.message)
    else console.error('[getVfrRtInProgress] RPC returned no/!array questions')
    return { status: 'not_found' }
  }

  return {
    status: 'active',
    sessionId,
    startedAt: row.started_at,
    timeLimitSeconds: row.time_limit_seconds,
    questions: data,
  }
}
